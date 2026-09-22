# Incentive Calculation Workbook — Formula & Logic Analysis

## 1. Overall Calculation Structure

The workbook contains 17 sheets:

- `Sheet1`
- `Incentive till July 22`
- `Incentive till Oct 22`
- `Incentive till Feb 23`
- `Incentive till June 23`
- `Incentive till Sept 23`
- `Incentive till Dec 23`
- `Incentive till March 24`
- `Incentive Till June 24`
- `Incentive till Sept 24`
- `Incentive till Dec 24`
- `Incentive till Mar 25`
- `Incentive till Jun 25`
- `Incentive till Sept 25`
- `Incentive till Dec 25`
- `Incentive till Mar 26`
- `Incentive till Jun 26`

The overall business logic is:

> **Total Incentive Pool = Total Kot × 6% − Penalties/Payouts**

The 6% incentive consists of:

- Super incentive = 3%
- Staff incentive = 3%

The resulting period incentive pool is then distributed among employees according to manually entered allocation percentages.

---

# 2. Master Sheet — `Sheet1`

## 2.1 Columns and their roles

| Column | Meaning |
|---|---|
| C | Total Kot |
| D | Super incentive @ 3% |
| E | Staff incentive @ 3% |
| F | Total incentive @ 6% |
| G | Less Penalty/Payout |
| H | Remark |
| K | Final amount for a period |

---

## 2.2 Incentive Calculation Formulas

### Formula 1 — Super Incentive

**Formula pattern:**

```excel
=C2*0.03
```

Applied to:

```text
D2:D73
```

General form:

```excel
=C[row]*0.03
```

### What it calculates

Calculates the Super Incentive as 3% of Total Kot.

### Business logic

```text
Super Incentive = Total Kot × 3%
```

### Inputs

- Total Kot from column C

### Output

- Super Incentive in column D

---

### Formula 2 — Staff Incentive

**Formula pattern:**

```excel
=C2*0.03
```

Applied to:

```text
E2:E73
```

General form:

```excel
=C[row]*0.03
```

### What it calculates

Calculates the Staff Incentive as 3% of Total Kot.

### Business logic

```text
Staff Incentive = Total Kot × 3%
```

### Inputs

- Total Kot from column C

### Output

- Staff Incentive in column E

---

### Formula 3 — Total Incentive

**Formula pattern:**

```excel
=C2*0.06
```

Applied to:

```text
F2:F73
```

General form:

```excel
=C[row]*0.06
```

### What it calculates

Calculates the total incentive at 6% of Total Kot.

### Business logic

```text
Total Incentive = Total Kot × 6%
```

This corresponds to:

```text
3% Super Incentive + 3% Staff Incentive = 6%
```

### Inputs

- Total Kot from column C

### Output

- Total Incentive in column F

### Dependency

The 6% calculation is independent of columns D and E; it directly calculates 6% from Total Kot rather than adding D + E.

---

# 3. Penalty Calculations

The penalty column is:

```text
G — Less Penalty/Payout
```

There are no IF-based penalty formulas. Penalties are entered manually either as hardcoded values or as formulas that add several penalty components.

---

## 3.1 Formula-Based Penalty Entries

| Cell | Exact Formula | Result |
|---|---|---:|
| G4 | `=200+576` | 776 |
| G5 | `=67+3300+3640+680` | 7,687 |
| G6 | `=50+3495` | 3,545 |
| G7 | `=50+479` | 529 |
| G8 | `=60+2000+3108` | 5,168 |
| G11 | `=1400+174` | 1,574 |
| G12 | `=15500+5197+80` | 20,777 |
| G13 | `=2000+476+121` | 2,597 |
| G15 | `=6000+1214` | 7,214 |
| G16 | `=327+168` | 495 |
| G19 | `=453+2380` | 2,833 |
| G30 | `=730+484` | 1,214 |
| G35 | `=510+498` | 1,008 |
| G37 | `=168` | 168 |
| G38 | `=2500+4140` | 6,640 |
| G40 | `=260` | 260 |
| G45 | `=11041+1000` | 12,041 |
| G53 | `=100+200` | 300 |
| G57 | `=1318+2114` | 3,432 |
| G58 | `=1100+2000` | 3,100 |
| G59 | `=804+700+700` | 2,204 |
| G63 | `=944+1100` | 2,044 |

### Logic

These formulas simply aggregate multiple manually identified penalty or recovery components.

For example:

```excel
=67+3300+3640+680
```

means:

```text
Penalty = Component 1 + Component 2 + Component 3 + Component 4
```

There is no automated classification of the components.

---

## 3.2 Hardcoded Penalty Amounts

The workbook also contains fixed penalty values such as:

```text
G9  = 125018
G14 = 456
G17 = 1496
G18 = 1682
G20 = 738
G21 = 14600
G22 = 599
G23 = 449
G24 = 923
G25 = 5353
G26 = 1296
G27 = 4000
G28 = 1294
G29 = 512
G31 = 6009
G32 = 3615
G33 = 2739
G34 = 552
G36 = 646
G39 = 0
G41 = 0
G42 = 17902.56
G43 = 0
G44 = 0
G46 = 25746
G48 = 500
G49 = 780
G50 = 4000
G51 = 1000
G54 = 200
G55 = 700
G56 = 250
G60 = 3000
G61 = 2911
G62 = 3437
```

These amounts are manually entered and therefore do not have a formula-level audit trail.

---

## 3.3 Penalty Remarks

Column H contains descriptions such as:

- Shortage
- 200Cs Pg 5/-
- Nanak 39 Cs & Shortage
- Airtel Device, debit note by parle
- Penalty
- Ashish Incentive, Penalty
- Penalty and MT recovery
- Wrong Billing
- Bank error
- Wrong RTGS and Sales Return
- MT Reliance Short
- Debit Note
- MT Penalty
- Detention

These remarks provide context but are not used as computational rules.

---

# 4. Final Period Incentive Pool

The final period amount is calculated in column K.

## General Formula

```excel
=SUM(F[start]:F[end])-SUM(G[start]:G[end])
```

### Business logic

```text
Final Incentive Pool
=
Total Incentive for Period
−
Penalties/Payouts for Period
```

---

## 4.1 Exact Final Pool Formulas

| Cell | Formula | Period |
|---|---|---|
| K1 | `=sum(F12:F16)-sum(G12:G16)` | Mar–Jul 2022 |
| K19 | `=SUM(F17:F19)-SUM(G17:G19)` | Aug–Oct 2022 |
| K23 | `=SUM(F20:F23)-SUM(G20:G23)` | Nov 2022–Feb 2023 |
| K27 | `=SUM(F24:F27)-SUM(G24:G27)` | Mar–Jun 2023 |
| K30 | `=SUM(F28:F30)-SUM(G28:G30)` | Jul–Sep 2023 |
| K33 | `=SUM(F31:F33)-SUM(G31:G33)` | Oct–Dec 2023 |
| K36 | `=SUM(F34:F36)-SUM(G34:G36)` | Jan–Mar 2024 |
| K39 | `=SUM(F37:F39)-SUM(G37:G39)` | Apr–Jun 2024 |
| K42 | `=SUM(F40:F42)-SUM(G40:G42)` | Jul–Sep 2024 |
| K45 | `=SUM(F43:F45)-SUM(G43:G45)` | Oct–Dec 2024 |
| K48 | `=SUM(F46:F48)-SUM(G46:G48)` | Jan–Mar 2025 |
| K51 | `=SUM(F49:F51)-SUM(G49:G51)` | Apr–Jun 2025 |
| K54 | `=SUM(F52:F54)-SUM(G52:G54)` | Jul–Sep 2025 |
| K57 | `=SUM(F55:F57)-SUM(G55:G57)` | Oct–Dec 2025 |
| K60 | `=SUM(F58:F60)-SUM(G58:G60)` | Jan–Mar 2026 |
| K63 | `=SUM(F61:F63)-SUM(G61:G63)` | Apr–Jun 2026 |
| K66 | `=SUM(F64:F66)-SUM(G64:G66)` | Jul–Sep 2026 |

---

# 5. Calculated Period Amounts

| Period | Final Incentive Pool |
|---|---:|
| Jul-22 | 48,886.50 |
| Oct-22 | 44,499.8656 |
| Feb-23 | 44,231.3046 |
| Jun-23 | 51,191.3858 |
| Sep-23 | 49,747.2796 |
| Dec-23 | 34,568.9340 |
| Mar-24 | 46,885.6658 |
| Jun-24 | 45,982.3430 |
| Sep-24 | 39,962.3710 |
| Dec-24 | 38,219.5732 |
| Mar-25 | 24,251.3704 |
| Jun-25 | 45,118.43872 |
| Sep-25 | 59,092.12462 |
| Dec-25 | 43,441.72432 |
| Mar-26 | 45,354.6834 |
| Jun-26 | 45,098.90666 |
| Sep-26 | 42,667.0530 |

---

# 6. Employee Incentive Distribution

The period-specific sheets generally use:

```excel
=$C$[TotalRow]*D[row]
```

### Business logic

```text
Individual Incentive
=
Period Incentive Pool × Employee Allocation %
```

The `$` symbols make the total incentive pool reference absolute.

For example:

```excel
=$C$15*D2
```

means:

- `$C$15` = fixed total incentive pool
- `D2` = employee allocation percentage
- Result = employee's incentive amount

---

# 7. Period-Specific Calculation Sheets

## 7.1 Incentive till Sept 24

Base:

```excel
C15 = 39962
```

Employee formulas:

```excel
C2:C11 = $C$15 * corresponding D cell
```

Total percentage:

```excel
D15 = SUM(D2:D11)
```

Allocation total:

```text
100%
```

Allocation:

| Participant | % |
|---|---:|
| Pavan Katre | 17% |
| Sandip Chitriv | 17% |
| Dheeraj Pawar | 10% |
| Jyoti Shende | 10% |
| Kartik Hirankhede | 10% |
| Prateek Supervisor | 8% |
| Navjot | 7% |
| Rohit | 0% |
| Ramendra | 7% |
| Penalty | 14% |

---

## 7.2 Incentive Till June 24

Base:

```excel
C15 = 45982
```

Formula:

```excel
C2:C13 = $C$15*D2:D13
```

Total:

```excel
D15 = SUM(D2:D13)
```

Allocation:

```text
100%
```

---

## 7.3 Incentive till July 22

This sheet is different because it directly references `Sheet1`.

Formula pattern:

```excel
D2 = C2*Sheet1!K$1
```

through:

```text
D2:D9
```

Total:

```excel
D10 = SUM(D2:D9)
```

Allocation percentages:

```text
18%
18%
15%
12.5%
10%
12.5%
9%
5%
```

Total:

```text
100%
```

### Dependency

```text
Sheet1!K1
    ↓
July-22 incentive sheet
    ↓
Employee percentage
    ↓
Individual incentive
```

This is the clearest explicit cross-sheet dependency in the workbook.

---

# 8. Incentive till Oct 22 — Special Case

This sheet contains no formulas.

The incentive amounts are hardcoded:

| Name | Incentive | Percentage |
|---|---:|---:|
| Pavan Katre | 8,010 | 18% |
| Sandip Chitriv | 8,010 | 18% |
| Dheeraj Pawar | 6,230 | 14% |
| Jyoti Shende | 4,005 | 9% |
| Rahul Wankhade | 4,005 | 9% |
| Kartik Hirankhede | 3,115 | 7% |
| Penalty Incentive | 11,125 | 25% |
| **Total** | **44,500** | **100%** |

This appears to be a manually finalized allocation rather than a live calculation.

---

# 9. February 2023

Formula:

```excel
C2:C10 = $C$12*D2:D10
```

Total:

```excel
D12 = SUM(D2:D10)
```

Base:

```text
C12 = 44,200
```

Allocation:

```text
100%
```

---

# 10. June 2023

Formula:

```excel
C2:C7 = $C$9*D2:D7
```

Total:

```excel
D9 = SUM(D2:D7)
```

Base:

```text
C9 = 51,191
```

Allocation:

```text
100%
```

---

# 11. September 2023

Formula:

```excel
C2:C8 = $C$10*D2:D8
```

Total:

```excel
D10 = SUM(D2:D8)
```

Base:

```text
C10 = 49,747
```

Allocation:

```text
100%
```

---

# 12. December 2023

Formula:

```excel
C2:C14 = $C$16*D2:D14
```

Total:

```excel
D16 = SUM(D2:D14)
```

Base:

```text
C16 = 34,568.934
```

Allocation:

```text
100%
```

---

# 13. March 2024

Formula:

```excel
C2:C14 = $C$16*D2:D14
```

Total:

```excel
D16 = SUM(D2:D14)
```

Base:

```text
C16 = 46,886
```

Allocation:

```text
99.72%
```

### Issue

```text
Unallocated = 100% − 99.72% = 0.28%
```

This should be investigated if the intention is to distribute the entire incentive pool.

---

# 14. June 2024

Base:

```text
C15 = 45,982
```

Formula pattern:

```excel
C2:C13 = $C$15*D2:D13
```

Total:

```excel
D15 = SUM(D2:D13)
```

Allocation:

```text
100%
```

---

# 15. September 2024

Base:

```text
C15 = 39,962
```

Formula:

```excel
C2:C11 = $C$15*D2:D11
```

Total:

```excel
D15 = SUM(D2:D11)
```

Allocation:

```text
100%
```

---

# 16. December 2024

Base:

```text
C15 = 38,220
```

Formula:

```excel
C2:C11 = $C$15*D2:D11
```

Total:

```excel
D15 = SUM(D2:D11)
```

Allocation:

```text
100%
```

---

# 17. March 2025

Base:

```text
C16 = 24,251
```

Formula:

```excel
C3:C13 = $C$16*D3:D13
```

Total:

```excel
D16 = SUM(D2:D13)
```

Allocation:

```text
100%
```

---

# 18. June 2025

Base:

```text
C15 = 45,118
```

Formula:

```excel
C3:C12 = $C$15*D3:D12
```

Total:

```excel
D15 = SUM(D2:D12)
```

Allocation:

```text
99.5%
```

### Issue

```text
Unallocated = 100% − 99.5% = 0.5%
```

The Penalty allocation is:

```text
22%
```

with the note:

```text
For 40K debit Note
```

---

# 19. September 2025

Base:

```text
C15 = 59,092
```

Formula:

```excel
C3:C12 = $C$15*D3:D12
```

Total:

```excel
D15 = SUM(D3:D12)
```

Allocation:

```text
100%
```

Penalty allocation:

```text
30%
```

---

# 20. December 2025

Base:

```text
C15 = 43,442
```

Formula:

```excel
C3:C10 = $C$15*D3:D10
```

Total:

```excel
D15 = SUM(D2:D12)
```

Allocation:

```text
100%
```

Penalty allocation:

```text
35%
```

Notes include:

```text
For 40K debit Note
Recovery done
```

---

# 21. March 2026

Base:

```text
C15 = 45,355
```

Formula:

```excel
C3:C11 = $C$15*D3:D11
```

Total:

```excel
D15 = SUM(D2:D12)
```

Allocation:

```text
100%
```

Penalty allocation:

```text
7%
```

Note:

```text
Future Recovery
```

---

# 22. June 2026

Base:

```text
C15 = 45,099
```

Formula:

```excel
C3:C11 = $C$15*D3:D11
```

Total:

```excel
D15 = SUM(D2:D12)
```

Allocation:

```text
100%
```

Penalty allocation:

```text
20%
```

Note:

```text
Dmart Recovery
```

---

# 23. Conditional Logic / IF Statements

No actual conditional formulas were found.

There are no:

```excel
IF()
IFS()
AND()
OR()
IFERROR()
```

based incentive or penalty rules.

There are also no formulas implementing:

- Threshold-based penalties
- Automatic penalty triggers
- Employee eligibility rules
- Automatic recovery rules
- Performance thresholds
- Automatic percentage assignment

Therefore, much of the business logic is manual.

For example, there is no formula like:

```excel
=IF(Shortage>Threshold,Penalty,...)
```

Instead, the penalty amount is manually entered.

---

# 24. Lookup Tables and Reference Data

No formal Excel lookup tables were found.

The workbook does not use:

- `VLOOKUP`
- `XLOOKUP`
- `HLOOKUP`
- `INDEX/MATCH`
- Named ranges
- Dedicated reference-data sheets
- Excel Tables for calculation rules

However, the employee allocation percentages function as manual reference data.

Example:

```text
Employee → Allocation %
Pavan Katre → 14%
Sandip Chitriv → 14%
Dheeraj Pawar → 9.5%
...
```

These percentages feed directly into the employee incentive formulas.

---

# 25. Variables, Parameters and Rates

The workbook implicitly depends on the following parameters:

| Parameter | Current Value |
|---|---:|
| Super incentive rate | 3% |
| Staff incentive rate | 3% |
| Combined incentive rate | 6% |
| Employee allocation % | Varies by period |
| Penalty amount | Manually entered |
| Penalty type | Manually described |
| Period | Monthly input / periodic settlement |
| Distribution | Period-specific |
| Main measurement unit | Total Kot |

The 3%, 3%, and 6% values are hardcoded directly into formulas.

---

# 26. Main Dependency Chain

The calculation flow can be represented as:

```text
Total Kot
   │
   ├── × 3% → Super Incentive
   │
   ├── × 3% → Staff Incentive
   │
   └── × 6% → Total Incentive
                    │
                    ▼
             Less Penalties
                    │
                    ▼
             Final Incentive Pool
                    │
                    ▼
       Employee Allocation Percentage
                    │
                    ▼
         Individual Incentive Amount
```

Mathematically:

```text
Monthly Incentive = Total Kot × 6%

Period Pool =
SUM(Monthly Incentive) − SUM(Penalties)

Employee Incentive =
Period Pool × Employee Allocation %
```

---

# 27. Potentially Problematic / Unusual Logic

## Issue 1 — Blank Total Kot Values

Some rows contain formulas such as:

```excel
D2 = C2*0.03
E2 = C2*0.03
F2 = C2*0.06
```

while the corresponding Total Kot input is blank.

The formulas therefore evaluate to zero when the input is blank.

### Recommendation

Only calculate completed periods, or explicitly distinguish future/template rows from active data.

---

## Issue 2 — Hardcoded Incentive Rates

The formulas contain:

```text
0.03
0.03
0.06
```

directly.

### Risk

If the incentive policy changes, many formulas must be manually updated.

### Recommendation

Create a central parameter area:

```text
Super Rate = 3%
Staff Rate = 3%
Total Rate = 6%
```

Then reference those cells from formulas.

---

## Issue 3 — Period Values Are Manually Copied

Examples:

```text
Sheet1 K42 = 39,962.371
September-24 base = 39,962
```

and:

```text
Sheet1 K45 = 38,219.5732
December-24 base = 38,220
```

and:

```text
Sheet1 K48 = 24,251.3704
March-25 base = 24,251
```

This indicates that period sheets often contain manually copied or rounded values rather than direct references to the master calculation.

### Risk

The master sheet can be updated while the period sheet retains an old amount.

### Recommendation

Link period sheets directly to the master final-pool cells.

---

## Issue 4 — Rounding Is Not Documented

The workbook contains differences between calculated master values and period-sheet base values.

Examples:

```text
39,962.371 → 39,962
38,219.5732 → 38,220
24,251.3704 → 24,251
```

### Risk

Small rounding differences can accumulate and create reconciliation issues.

### Recommendation

Define an explicit rounding policy, for example:

```text
Period Pool = ROUND(calculated_pool, 0)
```

if that is the intended business rule.

---

## Issue 5 — Incomplete Allocation Percentages

Two clear exceptions were identified.

### March 2024

```text
Total Allocation = 99.72%
Unallocated = 0.28%
```

### June 2025

```text
Total Allocation = 99.50%
Unallocated = 0.50%
```

If 100% of the incentive pool is intended to be distributed, these are discrepancies that need investigation.

---

## Issue 6 — Penalties and Employee Distribution Are Mixed

Some incentive sheets contain a `Penalty` or `Penalty Incentive` row inside the employee allocation table.

Examples include penalty percentages such as:

```text
22%
30%
35%
7%
20%
```

This creates a conceptual overlap between:

1. Penalties deducted from the incentive pool in `Sheet1`
2. Penalty/recovery amounts represented as allocation percentages in incentive sheets

### Recommendation

Separate these concepts in the CRM:

```text
Penalty / Recovery
        ↓
Deduct from Incentive Pool

Employee Allocation
        ↓
Distribute Remaining Incentive Pool
```

---

# 28. Other Unusual Items

## Incentive till Oct 22

The entire sheet is manually entered with no formulas.

This should be treated as historical/manual data rather than a formula-driven calculation.

---

## Sheet1!K1 Label

The label indicates:

```text
Final Amount July
```

but the formula:

```excel
=SUM(F12:F16)-SUM(G12:G16)
```

covers multiple months, apparently March–July 2022.

The label may therefore be ambiguous.

---

## Future Template Rows

Later rows contain month labels and formulas even where Total Kot data is not populated.

These appear to be future/preformatted rows rather than completed calculations.

---

# 29. Inconsistent Naming

Employee names are not always consistent across sheets.

Examples include variations such as:

```text
Pavan / Pawan Katre
Jyoti Shende / Jyoti Madam
Manohar Kharale / Manohar Kharole
Rohit / Rohan
```

### Risk

If this workbook is migrated to a CRM/database, inconsistent names can create duplicate employee records.

### Recommendation

Use a unique Employee ID and maintain:

```text
Employee ID
Employee Name
Department
Role
Status
```

rather than using employee names as the primary identifier.

---

# 30. Recommended CRM Calculation Structure

The spreadsheet logic should be converted into a structured rules engine rather than copied literally.

## A. Incentive Rules

Store:

```text
Super Incentive Rate = 3%
Staff Incentive Rate = 3%
Total Incentive Rate = 6%
```

---

## B. Period Data

Store:

```text
Period
Month
Total Kot
Gross Incentive
Penalty
Final Incentive Pool
```

---

## C. Penalties

Store each penalty separately:

```text
Penalty ID
Period
Penalty Type
Amount
Reason
Source
Recovery Status
Remarks
```

This avoids formulas such as:

```excel
=67+3300+3640+680
```

where the individual components are not formally identified.

---

## D. Employee Allocation

Store:

```text
Period
Employee ID
Employee Name
Allocation %
Calculated Incentive
```

The system should validate:

```text
SUM(Employee Allocation %) = 100%
```

---

## E. Validation Rules

The CRM should automatically check:

```text
Total Kot is not blank
Incentive rate is valid
Penalty amount is valid
Final pool reconciles
Employee allocation = 100%
No duplicate employee
No unexplained rounding difference
No negative incentive unless explicitly allowed
```

---

# 31. Final Extracted Formula Catalogue

## Master incentive formulas

```excel
D2:D73
=C[row]*0.03

E2:E73
=C[row]*0.03

F2:F73
=C[row]*0.06
```

---

## Master penalty formulas

```excel
G4  =200+576
G5  =67+3300+3640+680
G6  =50+3495
G7  =50+479
G8  =60+2000+3108
G11 =1400+174
G12 =15500+5197+80
G13 =2000+476+121
G15 =6000+1214
G16 =327+168
G19 =453+2380
G30 =730+484
G35 =510+498
G37 =168
G38 =2500+4140
G40 =260
G45 =11041+1000
G53 =100+200
G57 =1318+2114
G58 =1100+2000
G59 =804+700+700
G63 =944+1100
```

---

## Final pool formulas

```excel
K1  =SUM(F12:F16)-SUM(G12:G16)
K19 =SUM(F17:F19)-SUM(G17:G19)
K23 =SUM(F20:F23)-SUM(G20:G23)
K27 =SUM(F24:F27)-SUM(G24:G27)
K30 =SUM(F28:F30)-SUM(G28:G30)
K33 =SUM(F31:F33)-SUM(G31:G33)
K36 =SUM(F34:F36)-SUM(G34:G36)
K39 =SUM(F37:F39)-SUM(G37:G39)
K42 =SUM(F40:F42)-SUM(G40:G42)
K45 =SUM(F43:F45)-SUM(G43:G45)
K48 =SUM(F46:F48)-SUM(G46:G48)
K51 =SUM(F49:F51)-SUM(G49:G51)
K54 =SUM(F52:F54)-SUM(G52:G54)
K57 =SUM(F55:F57)-SUM(G55:G57)
K60 =SUM(F58:F60)-SUM(G58:G60)
K63 =SUM(F61:F63)-SUM(G61:G63)
K66 =SUM(F64:F66)-SUM(G64:G66)
```

---

## Employee distribution formula

General pattern:

```excel
=$C$[TotalCell]*D[row]
```

Percentage total:

```excel
=SUM(D[start]:D[end])
```

July 2022 exception:

```excel
D2 = C2*Sheet1!K$1
```

through:

```excel
D9 = C9*Sheet1!K$1
```

with:

```excel
D10 = SUM(D2:D9)
```

---

# 32. Bottom-Line Business Logic

The complete workbook logic can be summarized as:

### Step 1 — Calculate Monthly Incentive

```text
Monthly Incentive = Total Kot × 6%
```

where:

```text
6% = 3% Super + 3% Staff
```

### Step 2 — Calculate Period Pool

```text
Period Incentive Pool
=
SUM(Monthly Incentive)
−
SUM(Penalties/Payouts)
```

### Step 3 — Distribute Pool

```text
Employee Incentive
=
Period Incentive Pool
×
Employee Allocation %
```

### Step 4 — Validate Distribution

```text
SUM(Employee Allocation %)
≈
100%
```

The workbook currently has two notable exceptions:

```text
March 2024 → 99.72%
June 2025   → 99.50%
```

These should be reviewed before implementing the logic in the CRM.
