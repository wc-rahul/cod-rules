import { authenticate } from "../shopify.server";
import { useLoaderData, useFetcher } from "react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CountryRules from "./component/countryrules";
import OtherRules from "./component/otherrules";
import { FirebaseSessionStorage } from "../firebaseSessionStorage";

const storage = new FirebaseSessionStorage();

// ─── Action ────────────────────────────────────────────────────────────────────
// Called by useFetcher when the user hits Save.
export const action = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const shop = session.shop; // e.g. "example.myshopify.com"

    const body = await request.json();
    const { rules } = body;

    try {
        const docId = await storage.saveRules(shop, rules);
        return { ok: true, docId };
    } catch (err) {
        console.error("Failed to save rules:", err);
        return { ok: false, error: err.message };
    }
};

// ─── Loader ────────────────────────────────────────────────────────────────────
export const loader = async ({ request }) => {
    const { admin, session } = await authenticate.admin(request);
    const shop = session.shop;

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

    const shop_response = await admin.graphql(`
    #graphql
        query GetShopCurrencyCode {
            shop {
                currencyCode
            }
        }
    `);

    const json = await response.json();
    const currency_data = await shop_response.json();

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

    // Load previously saved rules for this shop — null if never saved
    const savedDoc = await storage.loadRules(shop);

    return {
        countries: Object.values(countryMap),
        currency_data,
        savedRules: savedDoc?.rules ?? null,
    };
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function Rules() {
    const { countries, currency_data, savedRules } = useLoaderData();
    const fetcher = useFetcher();

    // ─── SaveBar ──────────────────────────────────────────────────────────────
    const [isDirty, setIsDirty] = useState(false);
    const saveBarRef = useRef(null);

    // Keep stable refs to handlers so the event listeners below never go stale
    // without needing to detach/re-attach on every render.
    const handleSaveRef = useRef(null);
    const handleDiscardRef = useRef(null);

    // Attach DOM event listeners once on mount.
    // ui-save-bar is a Shopify web component — it dispatches custom DOM events,
    // not React synthetic events, so onClickSave / onClickDiscard props do nothing.
    useEffect(() => {
        const el = saveBarRef.current;
        if (!el) return;

        const onSave    = () => handleSaveRef.current?.();
        const onDiscard = () => handleDiscardRef.current?.();

        el.addEventListener("click-save",    onSave);
        el.addEventListener("click-discard", onDiscard);

        return () => {
            el.removeEventListener("click-save",    onSave);
            el.removeEventListener("click-discard", onDiscard);
        };
    }, []); // ← empty: attach once, refs keep handlers current

    // Show / hide SaveBar whenever isDirty changes
    useEffect(() => {
        if (saveBarRef.current) {
            isDirty ? saveBarRef.current.show() : saveBarRef.current.hide();
        }
    }, [isDirty]);

    // Wrap a setter so calling it also marks the form dirty
    const dirty = (setter) => (...args) => {
        setter(...args);
        setIsDirty(true);
    };

    // ─── Country / Province / Pincode — hydrate from saved rules ─────────────
    const [countryMode, setCountryMode] = useState(
        () => savedRules?.countryRule?.mode ?? "include"
    );
    const provinceMode = countryMode === "include" ? "exclude" : "include";

    // selectedCountries: [{ id: "IN", heading: "India" }]
    // Firestore stores only country codes → we start with codes and enrich
    // headings from countryById once it's built (see useEffect below)
    const [selectedCountries, setSelectedCountries] = useState(
        () => (savedRules?.countryRule?.values ?? []).map((id) => ({ id, heading: id }))
    );

    // selectedProvinces: { "IN": ["GJ", "MH"] }
    // Firestore stores: provinceRules.IN.values = ["GJ", "MH"]
    const [selectedProvinces, setSelectedProvinces] = useState(() => {
        const pr = savedRules?.provinceRules ?? {};
        const result = {};
        Object.entries(pr).forEach(([countryId, { values }]) => {
            result[countryId] = values;
        });
        return result;
    });

    const [pincodeRulesEnabled, setPincodeRulesEnabled] = useState(
        () => !!savedRules?.pincodeRules && savedRules.pincodeRules !== false
    );

    // selectedPincodes: { "IN__GJ": "395001, 395002" }
    // Firestore stores: pincodeRules.IN.GJ.values = ["395001", "395002"]
    const [selectedPincodes, setSelectedPincodes] = useState(() => {
        const pr = savedRules?.pincodeRules;
        if (!pr || pr === false) return {};
        const result = {};
        Object.entries(pr).forEach(([countryId, provinces]) => {
            Object.entries(provinces).forEach(([provinceCode, { values }]) => {
                result[`${countryId}__${provinceCode}`] = values.join(", ");
            });
        });
        return result;
    });

    // ─── Products / Collections ───────────────────────────────────────────────
    // _productSelectionIds is the full { id, variants } structure the picker needs
    const [selectedProducts, setSelectedProducts] = useState(
        () => savedRules?._productSelectionIds ?? []
    );
    const [variantIds, setVariantIds] = useState(
        () => savedRules?.productRule?.variantIds ?? []
    );
    const [collectionIds, setCollectionIds] = useState(
        () => savedRules?.collectionRule?.collectionIds ?? []
    );

    // ─── Tags ─────────────────────────────────────────────────────────────────
    const [productTags, setProductTags] = useState(
        () => (savedRules?.productTagRule?.values ?? []).join(", ")
    );
    const [customerTags, setCustomerTags] = useState(
        () => (savedRules?.customerTagRule?.values ?? []).join(", ")
    );

    // ─── Order range ──────────────────────────────────────────────────────────
    const [orderMin, setOrderMin] = useState(
        () => savedRules?.orderRangeRule?.min?.toString() ?? ""
    );
    const [orderMax, setOrderMax] = useState(
        () => savedRules?.orderRangeRule?.max?.toString() ?? ""
    );

    // ─── Lookups ──────────────────────────────────────────────────────────────
    const countryById = useMemo(
        () => Object.fromEntries(countries.map((c) => [c.id, c])),
        [countries]
    );

    // Enrich country headings after countryById is ready
    useEffect(() => {
        setSelectedCountries((prev) =>
            prev.map((c) => ({
                id: c.id,
                heading: countryById[c.id]?.name ?? c.heading,
            }))
        );
    }, [countryById]);

    const hasAnyProvinceSelection = Object.keys(selectedProvinces).some(
        (id) => (selectedProvinces[id]?.length ?? 0) > 0
    );
    const totalProvinces = Object.values(selectedProvinces).flat().length;

    const normalizePickerSelection = (selected) =>
        selected.map((item) => (typeof item === "string" ? item : item?.id)).filter(Boolean);

    // ─── Pickers ──────────────────────────────────────────────────────────────
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

        const nextProvinces = {};
        selectedIds.forEach((id) => {
            if (selectedProvinces[id]) nextProvinces[id] = selectedProvinces[id];
        });

        const nextPincodes = {};
        Object.keys(selectedPincodes).forEach((key) => {
            const [countryId] = key.split("__");
            if (selectedIds.includes(countryId)) nextPincodes[key] = selectedPincodes[key];
        });

        setSelectedCountries(normalizedCountries);
        setSelectedProvinces(nextProvinces);
        setSelectedPincodes(nextPincodes);
        setIsDirty(true);
    };

    const openProvincePicker = async () => {
        const provinceItems = [];
        selectedCountries.forEach((c) => {
            const country = countryById[c.id];
            if (!country?.provinces?.length) return;
            provinceItems.push({ id: `header__${country.id}`, heading: country.name, disabled: true });
            country.provinces.forEach((p) => {
                provinceItems.push({ id: `${country.id}__${p.code}`, heading: p.name });
            });
        });

        if (provinceItems.length === 0) return;

        const picker = await shopify.picker({
            heading: `Select provinces to ${provinceMode}`,
            multiple: true,
            items: provinceItems,
        });

        const selectedIds = normalizePickerSelection(await picker.selected);

        const grouped = {};
        selectedIds.forEach((id) => {
            if (id.startsWith("header__")) return;
            const [countryId, provinceCode] = id.split("__");
            if (!countryId || !provinceCode) return;
            if (!grouped[countryId]) grouped[countryId] = [];
            grouped[countryId].push(provinceCode);
        });

        const nextPincodes = {};
        selectedIds.forEach((id) => {
            if (id.startsWith("header__")) return;
            if (selectedPincodes[id]) nextPincodes[id] = selectedPincodes[id];
        });

        setSelectedProvinces(grouped);
        setSelectedPincodes(nextPincodes);
        setIsDirty(true);
    };

    const openProductPicker = async () => {
        const selectedVar = await shopify.resourcePicker({
            type: "product",
            multiple: true,
            selectionIds: selectedProducts.map((product) => ({
                id: product.id,
                variants: product.variants.map((variant) => ({ id: variant.id })),
            })),
        });

        if (!selectedVar) return;

        const fullStructure = selectedVar.map((product) => ({
            id: product.id,
            title: product.title,
            variants: product.variants.map((variant) => ({ id: variant.id })),
        }));

        setSelectedProducts(fullStructure);
        setVariantIds(selectedVar.flatMap((p) => p.variants.map((v) => v.id)));
        setIsDirty(true);
    };

    const openCollectionPicker = async () => {
        const selectedCol = await shopify.resourcePicker({
            type: "collection",
            multiple: true,
            selectionIds: collectionIds.map((id) => ({ id })),
        });

        if (!selectedCol) return;
        setCollectionIds(selectedCol.map((c) => c.id));
        setIsDirty(true);
    };

    // ─── Helpers ──────────────────────────────────────────────────────────────
    const parsePincodes = (str) =>
        (str || "").split(",").map((p) => p.trim()).filter(Boolean);

    const parseTags = (str) =>
        (str || "").split(",").map((t) => t.trim()).filter(Boolean);

    const getProvinceName = (countryId, code) =>
        countryById[countryId]?.provinces?.find((p) => p.code === code)?.name ?? code;

    const clearAll = () => {
        setSelectedCountries([]);
        setSelectedProvinces({});
        setSelectedPincodes({});
        setPincodeRulesEnabled(false);
        setIsDirty(true);
    };

    // ─── Build full rules JSON ─────────────────────────────────────────────────
    const buildFinalResult = useCallback(() => {
        const pincodeMode = provinceMode === "exclude" ? "include" : "exclude";

        const result = {
            countryRule: {
                mode: countryMode,
                values: selectedCountries.map((c) => c.id),
            },
            provinceRules: {},
            pincodeRules: pincodeRulesEnabled ? {} : false,

            // variantIds  → used at checkout rule evaluation (flat, fast)
            // selectionIds → stored so loader can re-hydrate picker state
            productRule: {
                mode: "exclude",
                variantIds,
                selectionIds: selectedProducts.map((p) => ({
                    id: p.id,
                    variants: p.variants.map((v) => ({ id: v.id })),
                })),
            },

            collectionRule: {
                mode: "exclude",
                collectionIds,
            },

            productTagRule: {
                mode: "exclude",
                values: parseTags(productTags),
            },

            customerTagRule: {
                mode: "exclude",
                values: parseTags(customerTags),
            },

            orderRangeRule: {
                min: orderMin !== "" ? parseFloat(orderMin) : null,
                max: orderMax !== "" ? parseFloat(orderMax) : null,
            },
        };

        Object.entries(selectedProvinces).forEach(([countryId, provinces]) => {
            if (provinces?.length) {
                result.provinceRules[countryId] = { mode: provinceMode, values: provinces };
            }
        });

        if (pincodeRulesEnabled) {
            Object.entries(selectedPincodes).forEach(([key, rawValue]) => {
                const pins = parsePincodes(rawValue);
                if (!pins.length) return;
                const [countryId, provinceCode] = key.split("__");
                if (!countryId || !provinceCode) return;
                const isSelected = (selectedProvinces[countryId] ?? []).includes(provinceCode);
                if (!isSelected) return;
                if (!result.pincodeRules[countryId]) result.pincodeRules[countryId] = {};
                result.pincodeRules[countryId][provinceCode] = { mode: pincodeMode, values: pins };
            });
        }

        return result;
    }, [
        countryMode, provinceMode, selectedCountries, selectedProvinces,
        pincodeRulesEnabled, selectedPincodes,
        variantIds, selectedProducts,
        collectionIds, productTags, customerTags, orderMin, orderMax,
    ]);

    // ─── Save via Remix action ─────────────────────────────────────────────────
    const handleSave = useCallback(() => {
        const rules = buildFinalResult();
        fetcher.submit(
            { rules },
            { method: "POST", encType: "application/json" }
        );
    }, [buildFinalResult, fetcher]);

    // Keep refs current so the SaveBar event listeners always call latest version
    handleSaveRef.current    = handleSave;
    handleDiscardRef.current = () => setIsDirty(false);

    // Clear dirty flag once the action confirms success
    useEffect(() => {
        if (fetcher.state === "idle" && fetcher.data?.ok === true) {
            setIsDirty(false);
        }
    }, [fetcher.state, fetcher.data]);

    const handleDiscard = useCallback(() => setIsDirty(false), []);
    const isSaving = fetcher.state !== "idle";

    return (
        <>

            {/* Shopify web component — listeners attached via useEffect above */}
            <ui-save-bar
                ref={saveBarRef}
            />

            <CountryRules
                countryMode={countryMode}
                setCountryMode={(mode) => { setCountryMode(mode); setIsDirty(true); }}
                selectedCountries={selectedCountries}
                setSelectedCountries={(v) => { setSelectedCountries(v); setIsDirty(true); }}
                selectedProvinces={selectedProvinces}
                setSelectedProvinces={(v) => { setSelectedProvinces(v); setIsDirty(true); }}
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
                setPincodeRulesEnabled={(v) => { setPincodeRulesEnabled(v); setIsDirty(true); }}
                selectedPincodes={selectedPincodes}
                setSelectedPincodes={(v) => { setSelectedPincodes(v); setIsDirty(true); }}
            />

            <OtherRules
                openProductPicker={openProductPicker}
                selectedProducts={selectedProducts}
                variantIds={variantIds}
                openCollectionPicker={openCollectionPicker}
                collectionIds={collectionIds}
                productTags={productTags}
                setProductTags={dirty(setProductTags)}
                customerTags={customerTags}
                setCustomerTags={dirty(setCustomerTags)}
                orderMin={orderMin}
                setOrderMin={dirty(setOrderMin)}
                orderMax={orderMax}
                setOrderMax={dirty(setOrderMax)}
                currency_data={currency_data}
            />

            {/* Bottom save bar */}
            <s-page>
                {(selectedCountries.length > 0 || isDirty) && (
                    <s-stack direction="inline" gap="small">
                        <s-button
                            variant="primary"
                            onClick={handleSave}
                            loading={isSaving}
                            disabled={isSaving}
                        >
                            {isSaving ? "Saving…" : "Save rules"}
                        </s-button>
                        <s-button variant="secondary" onClick={clearAll} disabled={isSaving}>
                            Clear all
                        </s-button>
                    </s-stack>
                )}
            </s-page>
        </>
    );
}