# SNOMED CT demo concepts for Lovable (premade ids + labels)

Use this as a **static seed list** for demo cards, dropdowns, or “example searches” when you are not shipping a full RF2 index. Pair each **`conceptId`** with your API’s **`GET /api/snomed/rf2/concept/{conceptId}`** (or equivalent) when a backend exists.

**Note:** Labels follow common **International** preferred terms. Your RF2 package may show slightly different **preferred** wording per edition/module; the **numeric id** is the stable key.

## Table (copy-friendly)

| SCTID | Preferred term (demo label) | Category |
|------|------------------------------|----------|
| 44054006 | Type 2 diabetes mellitus | Endocrine |
| 46635009 | Type 1 diabetes mellitus | Endocrine |
| 38341003 | Hypertensive disorder, systemic arterial | Cardiovascular |
| 22298006 | Myocardial infarction | Cardiovascular |
| 413343000 | Angina co-occurrent and due to coronary atherosclerosis | Cardiovascular |
| 195967001 | Asthma | Respiratory |
| 13645005 | Chronic obstructive lung disease | Respiratory |
| 386661006 | Fever | General / symptoms |
| 84229001 | Fatigue | General / symptoms |
| 271737000 | Anemia | Hematology |
| 14094001 | Hyperemesis gravidarum | Pregnancy |
| 77386006 | Pregnancy | Pregnancy |
| 773943001 | Fracture of bone | MSK |
| 128139000 | Inflammatory disorder | General |
| 840539006 | Disease caused by severe acute respiratory syndrome coronavirus 2 | Infection |
| 6142004 | Influenza | Infection |
| 301345002 | Difficulty sleeping | Mental / sleep |
| 35489007 | Depressive disorder | Mental |
| 403192003 | Tumor stage finding | Oncology / staging |
| 363346000 | Malignant neoplastic disease | Oncology |

## Example RF2 search strings (free-text)

`pregnancy`, `diabetes`, `hypertension`, `asthma`, `myocardial infarction`, `fever`, `covid`

## Machine-readable files in this repo

- `docs/LOVABLE_SNOMED_DEMO_CONCEPTS.json` — array + `search_suggestions`
- `docs/LOVABLE_SNOMED_DEMO_CONCEPTS.csv` — spreadsheet / Postgres seed import

## One-line prompt you can paste into Lovable

> Seed the SNOMED demo UI from `docs/LOVABLE_SNOMED_DEMO_CONCEPTS.json`: show each `conceptId` with `preferredTerm` and `category`; on row click call `GET …/api/snomed/rf2/concept/{conceptId}` when the API base URL is configured.
