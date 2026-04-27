import { authenticate } from "../shopify.server";
import { useLoaderData } from "react-router";
import { useMemo, useState } from "react";
import CountryRules from "./component/countryrules";

export const loader = async ({ request }) => {
    const { admin } = await authenticate.admin(request);

    const response = await admin.graphql(`
    #graphql
    query DeliveryZoneCountries {
      deliveryProfiles(first: 250) {
        nodes {
          profileLocationGroups {
            locationGroupZones(first: 250) {
              nodes {
                zone {
                  countries {
                    name
                    code { countryCode }
                    provinces { name code }
                  }
                }
              }
            }
          }
        }
      }
    }
  `);

    const json = await response.json();
    const profiles = json.data?.deliveryProfiles?.nodes ?? [];
    const countryMap = {};

    profiles.forEach((profile) => {
        profile.profileLocationGroups?.forEach((group) => {
            group.locationGroupZones?.nodes?.forEach((zoneNode) => {
                zoneNode.zone?.countries?.forEach((country) => {
                    const id = country.code.countryCode;
                    if (!countryMap[id]) {
                        countryMap[id] = { id, name: country.name, provinces: [] };
                    }
                    country.provinces?.forEach((p) => {
                        if (!countryMap[id].provinces.some((x) => x.code === p.code)) {
                            countryMap[id].provinces.push(p);
                        }
                    });
                });
            });
        });
    });

    return { countries: Object.values(countryMap) };
};

export default function Rules() {
    const { countries } = useLoaderData();

    // ─── Country mode ───
    // "include" = COD available only for selected countries
    // "exclude" = COD blocked for selected countries
    const [countryMode, setCountryMode] = useState("include");

    // provinceMode is always the inverse of countryMode
    // include countries → exclude provinces (block these provinces within allowed countries)
    // exclude countries → include provinces (allow these provinces within blocked countries)
    const provinceMode = countryMode === "include" ? "exclude" : "include";

    // [{ id: "IN", heading: "India" }, ...]
    const [selectedCountries, setSelectedCountries] = useState([]);

    // { "IN": ["GJ", "MH"], "US": ["CA"] }
    const [selectedProvinces, setSelectedProvinces] = useState({});

    // pincodeRulesEnabled: controls visibility of pincode inputs
    // selectedPincodes: { "IN__GJ": "395001, 395002", "IN__MH": "400001" }
    const [pincodeRulesEnabled, setPincodeRulesEnabled] = useState(false);
    const [selectedPincodes, setSelectedPincodes] = useState({});

    // Fast O(1) lookup by country code
    const countryById = useMemo(
        () => Object.fromEntries(countries.map((c) => [c.id, c])),
        [countries]
    );

    const hasAnyProvinceSelection = Object.keys(selectedProvinces).some(
        (id) => (selectedProvinces[id]?.length ?? 0) > 0
    );
    const totalProvinces = Object.values(selectedProvinces).flat().length;

    // Normalize picker output — can return strings or objects with .id
    const normalizePickerSelection = (selected) =>
        selected.map((item) => (typeof item === "string" ? item : item?.id)).filter(Boolean);

    // ─── Country picker ───
    const openCountryPicker = async () => {
        const picker = await shopify.picker({
            heading: `Select countries to ${countryMode}`,
            multiple: true,
            items: countries.map((c) => ({ id: c.id, heading: c.name })),
        });

        const selectedIds = normalizePickerSelection(await picker.selected);

        const normalizedCountries = selectedIds
            .map((id) => {
                const country = countryById[id];
                return country ? { id: country.id, heading: country.name } : null;
            })
            .filter(Boolean);

        // Prune provinces for deselected countries
        const nextProvinces = {};
        selectedIds.forEach((id) => {
            if (selectedProvinces[id]) nextProvinces[id] = selectedProvinces[id];
        });

        // Prune pincodes for deselected countries
        const nextPincodes = {};
        Object.keys(selectedPincodes).forEach((key) => {
            const [countryId] = key.split("__");
            if (selectedIds.includes(countryId)) nextPincodes[key] = selectedPincodes[key];
        });

        setSelectedCountries(normalizedCountries);
        setSelectedProvinces(nextProvinces);
        setSelectedPincodes(nextPincodes);
    };

    // ─── Province picker ───
    const openProvincePicker = async () => {
        const provinceItems = [];

        selectedCountries.forEach((c) => {
            const country = countryById[c.id];
            if (!country?.provinces?.length) return;

            // Disabled header row — country name as section label
            provinceItems.push({
                id: `header__${country.id}`,
                heading: country.name,
                disabled: true,
            });

            country.provinces.forEach((p) => {
                provinceItems.push({
                    id: `${country.id}__${p.code}`,
                    heading: p.name,
                });
            });
        });

        if (provinceItems.length === 0) return;

        const picker = await shopify.picker({
            heading: `Select provinces to ${provinceMode}`,
            multiple: true,
            items: provinceItems,
        });

        const selectedIds = normalizePickerSelection(await picker.selected);

        // Group by country
        const grouped = {};
        selectedIds.forEach((id) => {
            if (id.startsWith("header__")) return;
            const [countryId, provinceCode] = id.split("__");
            if (!countryId || !provinceCode) return;
            if (!grouped[countryId]) grouped[countryId] = [];
            grouped[countryId].push(provinceCode);
        });

        // Prune pincodes for deselected provinces
        const nextPincodes = {};
        selectedIds.forEach((id) => {
            if (id.startsWith("header__")) return;
            if (selectedPincodes[id]) nextPincodes[id] = selectedPincodes[id];
        });

        setSelectedProvinces(grouped);
        setSelectedPincodes(nextPincodes);
    };

    // Parse comma-separated string → trimmed array (case-sensitive, as entered)
    const parsePincodes = (str) =>
        (str || "").split(",").map((p) => p.trim()).filter(Boolean);

    // ─── Build final output ───
    const buildFinalResult = () => {
        // pincodeMode is opposite of provinceMode
        const pincodeMode = provinceMode === "exclude" ? "include" : "exclude";

        const result = {
            countryRule: {
                mode: countryMode,
                values: selectedCountries.map((c) => c.id),
            },
            provinceRules: {},
            // false when disabled, {} or populated object when enabled
            pincodeRules: pincodeRulesEnabled ? {} : false,
        };

        // Build provinceRules
        Object.entries(selectedProvinces).forEach(([countryId, provinces]) => {
            if (provinces?.length) {
                result.provinceRules[countryId] = {
                    mode: provinceMode,
                    values: provinces,
                };
            }
        });

        // Build pincodeRules (only when enabled)
        if (pincodeRulesEnabled) {
            Object.entries(selectedPincodes).forEach(([key, rawValue]) => {
                const pins = parsePincodes(rawValue);
                if (!pins.length) return;

                const [countryId, provinceCode] = key.split("__");
                if (!countryId || !provinceCode) return;

                // Only include if province is still selected
                const isSelected = (selectedProvinces[countryId] ?? []).includes(provinceCode);
                if (!isSelected) return;

                if (!result.pincodeRules[countryId]) result.pincodeRules[countryId] = {};
                result.pincodeRules[countryId][provinceCode] = {
                    mode: pincodeMode,
                    values: pins,
                };
            });
        }

        console.log("FINAL RESULT:", JSON.stringify(result, null, 2));
        return result;
    };

    const getProvinceName = (countryId, code) =>
        countryById[countryId]?.provinces?.find((p) => p.code === code)?.name ?? code;

    const clearAll = () => {
        setSelectedCountries([]);
        setSelectedProvinces({});
        setSelectedPincodes({});
        setPincodeRulesEnabled(false);
    };

    return (
        <CountryRules
            countryMode={countryMode}
            setCountryMode={setCountryMode}
            selectedCountries={selectedCountries}
            setSelectedCountries={setSelectedCountries}
            selectedProvinces={selectedProvinces}
            setSelectedProvinces={setSelectedProvinces}
            countryById={countryById}
            provinceMode={provinceMode}
            hasAnyProvinceSelection={hasAnyProvinceSelection}
            totalProvinces={totalProvinces}
            clearAll={clearAll}
            openCountryPicker={openCountryPicker}
            openProvincePicker={openProvincePicker}
            buildFinalResult={buildFinalResult}
            getProvinceName={getProvinceName}
            pincodeRulesEnabled={pincodeRulesEnabled}
            setPincodeRulesEnabled={setPincodeRulesEnabled}
            selectedPincodes={selectedPincodes}
            setSelectedPincodes={setSelectedPincodes}
        />
    );
}