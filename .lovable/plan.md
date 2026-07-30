## Plan: Lower SMS pricing by reducing default markup to 35%

### Current state
- Default markup is **41%**.
- Pricing formula: `sell_price = (cost_price + passthrough_fee) × (1 + markup / 100)`.
- The pricing sync updates all active countries that have a published carrier rate (about 65 countries). Other countries keep their existing price.

### What I will do
1. **Change the default markup from 41% to 35%** in `platform_settings.default_markup_percent`.
2. **Re-apply the new markup to all active, non-overridden countries** by recalculating `sell_price` using the existing `cost_price` + `passthrough_fee`.
3. **Run the carrier pricing sync** so any countries in the published rate map also get fresh `cost_price` values at the new 35% markup.
4. **Verify the database below-cost guard still protects you**: the trigger `country_rates_prevent_below_cost_trigger` will reject any rate that falls below true cost.
5. **Update UI references** if any page hardcodes the old 41%/50% assumption, and confirm the **Admin → Rates** page shows the new 35% default and updated sell prices.

### Expected result
- Tenant SMS budgets drop slightly across all synced countries.
- US SMS stays at roughly the same level because the US rate is manually set; other countries decrease by ~6% relative margin.
- No country will be priced below your actual carrier cost.

### No changes to
- Manually overridden country rows (they keep their custom prices).
- `mms_multiplier` values.
- `passthrough_fee` values.

---

Do you want me to proceed with 35%?