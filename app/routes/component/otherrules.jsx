export default function OtherRules({
    // products
    openProductPicker,
    selectedProducts,
    variantIds,
    // collections
    openCollectionPicker,
    collectionIds,
    // tags
    productTags,
    setProductTags,
    customerTags,
    setCustomerTags,
    // order range
    orderMin,
    setOrderMin,
    orderMax,
    setOrderMax,
    // currency
    currency_data,
}) {
    const currencyCode = currency_data?.data?.shop?.currencyCode ?? "";

    // Count unique products selected (not variants)
    const productCount = selectedProducts?.length ?? 0;
    const variantCount = variantIds?.length ?? 0;
    const collectionCount = collectionIds?.length ?? 0;

    return (
        <s-page>
            <s-section>
                <s-box padding="base" border="base" borderRadius="base">
                    <s-stack gap="large-400">

                        {/* ── 4. Products ── */}
                        <s-stack gap="small">
                            <s-heading>4. Specifically exclude products</s-heading>
                            <s-text tone="subdued">
                                COD will be hidden for orders containing any of these product variants.
                            </s-text>
                            <s-stack gap="small" direction="inline" alignItems="center">
                                <s-button onClick={openProductPicker}>
                                    {productCount > 0 ? "Edit products" : "Select products"}
                                </s-button>
                                {productCount > 0 && (
                                    <s-text tone="subdued">
                                        {productCount} product{productCount === 1 ? "" : "s"} ({variantCount} variant{variantCount === 1 ? "" : "s"}) selected
                                    </s-text>
                                )}
                            </s-stack>

                            {/* Show selected product names as badges */}
                            {productCount > 0 && (
                                <s-stack direction="inline" gap="small" wrap>
                                    {selectedProducts.map((p) => (
                                        <s-badge key={p.id} tone="critical">
                                            {p.title ?? p.id}
                                        </s-badge>
                                    ))}
                                </s-stack>
                            )}
                        </s-stack>

                        {/* ── 5. Collections ── */}
                        <s-stack gap="small">
                            <s-heading>5. Specifically exclude collections</s-heading>
                            <s-text tone="subdued">
                                COD will be hidden for orders containing products from any of these collections.
                            </s-text>
                            <s-stack gap="small" direction="inline" alignItems="center">
                                <s-button onClick={openCollectionPicker}>
                                    {collectionCount > 0 ? "Edit collections" : "Select collections"}
                                </s-button>
                                {collectionCount > 0 && (
                                    <s-text tone="subdued">
                                        {collectionCount} collection{collectionCount === 1 ? "" : "s"} selected
                                    </s-text>
                                )}
                            </s-stack>
                        </s-stack>

                        {/* ── 6. Product tags ── */}
                        <s-stack gap="small">
                            <s-heading>6. Specifically exclude COD for products with tags</s-heading>
                            <s-text tone="subdued">
                                COD will be hidden if the cart contains a product with any of these tags.
                            </s-text>
                            <s-text-field
                                label="Product tags"
                                value={productTags}
                                placeholder="no-cod, cod-excluded, prepaid-only"
                                helpText="Comma-separated. Example: no-cod, prepaid-only"
                                onChange={(e) => setProductTags(e.target.value)}
                            />
                            {productTags?.trim() && (
                                <s-stack direction="inline" gap="small" wrap>
                                    {productTags.split(",").map((t) => t.trim()).filter(Boolean).map((tag) => (
                                        <s-badge key={tag} tone="warning">{tag}</s-badge>
                                    ))}
                                </s-stack>
                            )}
                        </s-stack>

                        {/* ── 7. Customer tags ── */}
                        <s-stack gap="small">
                            <s-heading>7. Specifically exclude COD for customers with tags</s-heading>
                            <s-text tone="subdued">
                                COD will be hidden for customers who have any of these tags on their account.
                            </s-text>
                            <s-text-field
                                label="Customer tags"
                                value={customerTags}
                                placeholder="cod-blocked, fraud-risk, no-cod"
                                helpText="Comma-separated. Example: cod-blocked, fraud-risk"
                                onChange={(e) => setCustomerTags(e.target.value)}
                            />
                            {customerTags?.trim() && (
                                <s-stack direction="inline" gap="small" wrap>
                                    {customerTags.split(",").map((t) => t.trim()).filter(Boolean).map((tag) => (
                                        <s-badge key={tag} tone="warning">{tag}</s-badge>
                                    ))}
                                </s-stack>
                            )}
                        </s-stack>

                        {/* ── 8. Order range ── */}
                        <s-stack gap="small">
                            <s-heading>8. Order amount range</s-heading>
                            <s-text tone="subdued">
                                COD is available only when the order total falls within this range.
                                Leave max empty for no upper limit.
                            </s-text>
                            <s-stack direction="inline" gap="small">
                                <s-number-field
                                    label="Minimum order amount"
                                    value={orderMin}
                                    prefix={currencyCode}
                                    inputMode="decimal"
                                    step="0.01"
                                    min="0"
                                    placeholder="0.00"
                                    onChange={(e) => setOrderMin(e.target.value)}
                                />
                                <s-number-field
                                    label="Maximum order amount"
                                    value={orderMax}
                                    prefix={currencyCode}
                                    inputMode="decimal"
                                    step="0.01"
                                    min="0"
                                    placeholder="No limit"
                                    onChange={(e) => setOrderMax(e.target.value)}
                                />
                            </s-stack>
                        </s-stack>

                    </s-stack>
                </s-box>
            </s-section>
        </s-page>
    );
}