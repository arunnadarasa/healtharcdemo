# NHS UK dataset lane — Lovable sample seeds + tiny CSV fixtures

The live API reads **three CSV files** under **`data/`** with headers including **`text`** and **`raw_data_id`** (`server/neighbourhood/nhsUkCsvSearch.js`). For Lovable smoke tests or a minimal cloud deploy, copy the **mini fixtures** from `docs/lovelyable-nhs-uk-fixtures/` to the **canonical filenames** below.

## Canonical `data/` filenames

| Dataset id | Target path under `data/` |
|------------|----------------------------|
| `nhs_qa` | `prepared_generated_data_for_nhs_uk_qa.csv` |
| `nhs_conversations` | `prepared_generated_data_for_nhs_uk_conversations.csv` |
| `medical_tasks` | `prepared_generated_data_for_medical_tasks.csv` |

```bash
cp docs/lovelyable-nhs-uk-fixtures/mini-nhs_qa.csv data/prepared_generated_data_for_nhs_uk_qa.csv
cp docs/lovelyable-nhs-uk-fixtures/mini-nhs_conversations.csv data/prepared_generated_data_for_nhs_uk_conversations.csv
cp docs/lovelyable-nhs-uk-fixtures/mini-medical_tasks.csv data/prepared_generated_data_for_medical_tasks.csv
```

## Preset API scenarios

- **`docs/LOVABLE_NHS_UK_DATASET_LANE.json`** — `scenarios[]` with `search` and `synthesis` bodies for paid **`POST /api/neighbourhood/uk/search`** and **`POST /api/neighbourhood/uk/synthesis`** (synthesis needs **`FEATHERLESS_API_KEY`** on the server).
- **`docs/LOVABLE_NHS_UK_DATASET_LANE.csv`** — same content in flat form for spreadsheets.

## One-line Lovable prompt

> Seed the UK lane from `docs/LOVABLE_NHS_UK_DATASET_LANE.json`: dataset dropdown uses `dataset`; wire Search to paid `POST /api/neighbourhood/uk/search` with `scenario.search` and Synthesize to `POST /api/neighbourhood/uk/synthesis` with `scenario.synthesis`.
