# Artificial HES sample CSVs (bulk files)

**Lovable handover (MD + JSON + CSV table):** use **[`docs/LOVABLE_ARTIFICIAL_HES_SAMPLE.md`](../docs/LOVABLE_ARTIFICIAL_HES_SAMPLE.md)** plus **`docs/LOVABLE_ARTIFICIAL_HES_SAMPLE.json`** and **`docs/LOVABLE_ARTIFICIAL_HES_SAMPLE.csv`**.

This folder holds the **ingestable** CSVs:

| Path | Rows (default generator) |
|------|---------------------------|
| `csv/ae/artificial_hes_ae_lovable_sample.csv` | 8000 |
| `csv/op/artificial_hes_op_lovable_sample.csv` | 5000 |
| `csv/apc/artificial_hes_apc_lovable_sample.csv` | 4000 |

Regenerate: **`npm run hes:generate-lovable-sample`** (see env vars in `scripts/generate-artificial-hes-sample-csv.mjs`).
