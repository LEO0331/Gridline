# Scenario assumptions worksheet

The scenario page accepts user-entered assumptions for power delay, power availability, demand, capital expenditure, and regulatory pressure. The engine normalizes unsupported regions to `All regions`, converts invalid numbers to zero and clamps inputs to configured bounds (delay 0–24 months; power −30–30%; demand/capex −20–30%; regulatory delta −20–40). The optional API validates and stores those inputs with methodology version `gridline-scenario-v2.0.0`.

The former example baselines (76/58), regional multipliers, and company sensitivity coefficients were removed because they had no calibrated source. The worksheet does **not** calculate an expansion score, pushback score, company impact, forecast, or investment ranking. Saved values are hypothetical user inputs, not observed measurements. `POST /api/scenario` persists an API worksheet; `GET /api/scenario/runs` exposes only current-version runs. The static Pages worksheet can be used without this API or Supabase and does not automatically persist inputs to either backend.

A future quantitative scenario model requires dated baseline observations, sourced parameter estimates, and retrospective validation before publishing outputs.
