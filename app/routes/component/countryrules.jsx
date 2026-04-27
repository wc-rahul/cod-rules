export default function CountryRules({
  countryMode,
  setCountryMode,
  selectedCountries,
  selectedProvinces,
  countryById,
  provinceMode,
  hasAnyProvinceSelection,
  totalProvinces,
  clearAll,
  openCountryPicker,
  openProvincePicker,
  buildFinalResult,
  getProvinceName,
  pincodeRulesEnabled,
  setPincodeRulesEnabled,
  selectedPincodes,
  setSelectedPincodes,
}) {
  const pincodeMode = provinceMode === "exclude" ? "include" : "exclude";

  const parsePincodes = (str) =>
    (str || "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

  const handlePincodeChange = (key, value) => {
    setSelectedPincodes((prev) => ({ ...prev, [key]: value }));
  };

  const anyCountryHasProvinces = selectedCountries.some(
    (c) => (countryById[c.id]?.provinces?.length ?? 0) > 0
  );

  const selectedCountryNames = selectedCountries.map((c) => c.heading).join(", ");

  return (
    <s-page heading="COD Rules">
      <s-section heading="Rule builder">
        <s-stack gap="base">
          <s-text tone="subdued">
            Choose where Cash on Delivery should be available. Start with countries,
            then add province and pincode exceptions only when needed.
          </s-text>

          <s-columns columns="2" spacing="loose">
            {/* LEFT: CONFIGURATION */}
            <s-column>
              <s-stack gap="base">
                {/* COUNTRY */}
                <s-box padding="base" border="base" borderRadius="base">
                  <s-stack gap="small">
                    <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                      <s-text fontWeight="bold">1. Countries</s-text>
                      <s-badge tone={countryMode === "include" ? "success" : "critical"}>
                        {countryMode === "include" ? "Allow list" : "Block list"}
                      </s-badge>
                    </s-stack>

                    <s-text tone="subdued">
                      {countryMode === "include"
                        ? "COD is available only in the selected countries."
                        : "COD is blocked in the selected countries."}
                    </s-text>

                    <s-stack direction="inline" gap="small">
                      <s-button
                        variant={countryMode === "include" ? "primary" : "secondary"}
                        onClick={() => {
                          setCountryMode("include");
                          clearAll();
                        }}
                      >
                        Allow selected countries
                      </s-button>
                      <s-button
                        variant={countryMode === "exclude" ? "primary" : "secondary"}
                        onClick={() => {
                          setCountryMode("exclude");
                          clearAll();
                        }}
                      >
                        Block selected countries
                      </s-button>
                    </s-stack>

                    <s-button onClick={openCountryPicker}>
                      {selectedCountries.length > 0 ? "Edit countries" : "Select countries"}
                    </s-button>

                    {selectedCountries.length > 0 && (
                      <s-stack gap="small">
                        <s-text tone="subdued">
                          {selectedCountries.length} selected
                        </s-text>

                        <s-stack direction="inline" gap="small" wrap>
                          {selectedCountries.map((c) => (
                            <s-badge
                              key={c.id}
                              tone={countryMode === "include" ? "success" : "critical"}
                            >
                              {c.heading}
                            </s-badge>
                          ))}
                        </s-stack>
                      </s-stack>
                    )}
                  </s-stack>
                </s-box>

                {/* PROVINCE */}
                {anyCountryHasProvinces && (
                  <s-box padding="base" border="base" borderRadius="base">
                    <s-stack gap="small">
                      <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                        <s-text fontWeight="bold">2. Provinces</s-text>
                        <s-badge tone={provinceMode === "include" ? "success" : "critical"}>
                          {provinceMode === "include" ? "Allow exceptions" : "Block exceptions"}
                        </s-badge>
                      </s-stack>

                      <s-text tone="subdued">
                        {provinceMode === "exclude"
                          ? "Block specific provinces inside the allowed countries."
                          : "Allow specific provinces inside the blocked countries."}
                      </s-text>

                      <s-button onClick={openProvincePicker}>
                        {hasAnyProvinceSelection ? "Edit provinces" : "Select provinces"}
                      </s-button>

                      {hasAnyProvinceSelection && (
                        <s-text tone="subdued">
                          {totalProvinces} province{totalProvinces === 1 ? "" : "s"} selected
                        </s-text>
                      )}

                      {hasAnyProvinceSelection && (
                        <s-stack gap="small">
                          {selectedCountries.map((c) => {
                            const codes = selectedProvinces[c.id] ?? [];
                            if (codes.length === 0) return null;

                            return (
                              <s-box key={c.id} padding="small" border="base" borderRadius="base">
                                <s-stack gap="small">
                                  <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                                    <s-text fontWeight="bold">{c.heading}</s-text>
                                    <s-text tone="subdued">
                                      {codes.length} province{codes.length === 1 ? "" : "s"}
                                    </s-text>
                                  </s-stack>

                                  <s-stack direction="inline" gap="small" wrap>
                                    {codes.map((code) => (
                                      <s-badge
                                        key={code}
                                        tone={provinceMode === "include" ? "success" : "critical"}
                                      >
                                        {getProvinceName(c.id, code)}
                                      </s-badge>
                                    ))}
                                  </s-stack>
                                </s-stack>
                              </s-box>
                            );
                          })}
                        </s-stack>
                      )}
                    </s-stack>
                  </s-box>
                )}

                {/* PINCODE */}
                {hasAnyProvinceSelection && (
                  <s-box padding="base" border="base" borderRadius="base">
                    <s-stack gap="small">
                      <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                        <s-text fontWeight="bold">3. Pincodes</s-text>
                        <s-badge tone={pincodeRulesEnabled ? "info" : "subdued"}>
                          {pincodeRulesEnabled ? "On" : "Off"}
                        </s-badge>
                      </s-stack>

                      <s-text tone="subdued">
                        Optional pincode overrides for the provinces you selected.
                      </s-text>

                      <s-checkbox
                        checked={pincodeRulesEnabled}
                        onChange={(e) => {
                          setPincodeRulesEnabled(e.target.checked);
                          if (!e.target.checked) setSelectedPincodes({});
                        }}
                      >
                        Enable pincode rules
                      </s-checkbox>

                      {pincodeRulesEnabled && (
                        <s-stack gap="base">
                          <s-banner tone="info">
                            <s-text>
                              Enter pincodes separated by commas. Example: 395001, 395002, 400001
                            </s-text>
                          </s-banner>

                          {selectedCountries.map((c) => {
                            const codes = selectedProvinces[c.id] ?? [];
                            if (codes.length === 0) return null;

                            return (
                              <s-stack key={c.id} gap="small">
                                <s-text fontWeight="bold">{c.heading}</s-text>

                                {codes.map((code) => {
                                  const pKey = `${c.id}__${code}`;
                                  const currentValue = selectedPincodes[pKey] ?? "";
                                  const provinceName = getProvinceName(c.id, code);
                                  const pins = parsePincodes(currentValue);

                                  return (
                                    <s-box
                                      key={pKey}
                                      padding="small"
                                      border="base"
                                      borderRadius="base"
                                    >
                                      <s-stack gap="small">
                                        <s-stack direction="inline" gap="small" alignItems="center">
                                          <s-badge tone={provinceMode === "include" ? "success" : "critical"}>
                                            {provinceName}
                                          </s-badge>
                                          <s-badge tone={pincodeMode === "include" ? "info" : "warning"}>
                                            {pincodeMode === "include" ? "Allow" : "Block"} pincode
                                          </s-badge>
                                        </s-stack>

                                        <s-text-field
                                          label={`Pincodes for ${provinceName}`}
                                          value={currentValue}
                                          placeholder="395001, 395002"
                                          onChange={(e) => handlePincodeChange(pKey, e.target.value)}
                                          helpText="Comma-separated values."
                                        />

                                        {pins.length > 0 && (
                                          <s-stack direction="inline" gap="small" wrap>
                                            {pins.map((pin) => (
                                              <s-badge
                                                key={pin}
                                                tone={pincodeMode === "include" ? "success" : "critical"}
                                              >
                                                {pin}
                                              </s-badge>
                                            ))}
                                          </s-stack>
                                        )}
                                      </s-stack>
                                    </s-box>
                                  );
                                })}
                              </s-stack>
                            );
                          })}
                        </s-stack>
                      )}
                    </s-stack>
                  </s-box>
                )}

                {selectedCountries.length > 0 && (
                  <s-stack direction="inline" gap="small">
                    <s-button variant="primary" onClick={buildFinalResult}>
                      Save rules
                    </s-button>
                    <s-button variant="secondary" onClick={clearAll}>
                      Clear all
                    </s-button>
                  </s-stack>
                )}
              </s-stack>
            </s-column>

            {/* RIGHT: PREVIEW */}
            <s-column>
              <s-box padding="base" border="base" borderRadius="base" background="subdued">
                <s-stack gap="base">
                  <s-stack gap="small">
                    <s-text fontWeight="bold">Live preview</s-text>
                    <s-text tone="subdued">
                      This is how the rule will read for a merchant.
                    </s-text>
                  </s-stack>

                  <s-divider />

                  {selectedCountries.length === 0 ? (
                    <s-stack gap="small">
                      <s-text tone="subdued">No countries selected yet.</s-text>
                      <s-text tone="subdued">
                        Choose a country rule to start building your COD settings.
                      </s-text>
                    </s-stack>
                  ) : (
                    <s-stack gap="base">
                      <s-box padding="small" border="base" borderRadius="base">
                        <s-stack gap="small">
                          <s-badge tone={countryMode === "include" ? "success" : "critical"}>
                            {countryMode === "include" ? "COD allowed in selected countries" : "COD blocked in selected countries"}
                          </s-badge>
                          <s-text tone="subdued">
                            {selectedCountryNames}
                          </s-text>
                        </s-stack>
                      </s-box>

                      {selectedCountries.map((c) => {
                        const provinceCodes = selectedProvinces[c.id] ?? [];
                        const hasProvinceData = (countryById[c.id]?.provinces?.length ?? 0) > 0;

                        return (
                          <s-box key={c.id} padding="small" border="base" borderRadius="base">
                            <s-stack gap="small">
                              <s-stack direction="inline" gap="small" alignItems="center">
                                <s-badge tone={countryMode === "include" ? "success" : "critical"}>
                                  {c.heading}
                                </s-badge>
                                <s-text tone="subdued">({c.id})</s-text>
                              </s-stack>

                              {!hasProvinceData && (
                                <s-text tone="subdued">
                                  Applies to the whole country.
                                </s-text>
                              )}

                              {hasProvinceData && provinceCodes.length === 0 && (
                                <s-text tone="subdued">
                                  No province exceptions set.
                                </s-text>
                              )}

                              {provinceCodes.length > 0 && (
                                <s-stack gap="small">
                                  <s-text tone="subdued">
                                    {provinceMode === "exclude"
                                      ? "Blocked provinces:"
                                      : "Allowed provinces:"}
                                  </s-text>

                                  <s-stack direction="inline" gap="small" wrap>
                                    {provinceCodes.map((code) => {
                                      const provinceName = getProvinceName(c.id, code);
                                      return (
                                        <s-badge
                                          key={code}
                                          tone={provinceMode === "include" ? "success" : "critical"}
                                        >
                                          {provinceName}
                                        </s-badge>
                                      );
                                    })}
                                  </s-stack>

                                  {pincodeRulesEnabled && (
                                    <s-text tone="subdued">
                                      Pincode overrides are enabled for this province group.
                                    </s-text>
                                  )}
                                </s-stack>
                              )}
                            </s-stack>
                          </s-box>
                        );
                      })}
                    </s-stack>
                  )}
                </s-stack>
              </s-box>
            </s-column>
          </s-columns>
        </s-stack>
      </s-section>
    </s-page>
  );
}