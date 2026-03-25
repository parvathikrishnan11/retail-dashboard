"""
Dataset: Online_Retail.xlsx (from UCI Machine Learning Repository)

Using the excel file to clean out the data based on the proposal

Preprocessing invalid records: 
1. Quantity ≤ 0 and UnitPrice ≤ 0 excluded
2. Removing cancelled invoices: InvoiceNo starting with 'C' excluded
3. Using the InvoiceDate to get the datetime and then extracting Month and Year for View 1
4. Computing Revenue = Quantity × UnitPrice per line item
5. Getting the monthly totals for the time series (View 1)
6. Getting the country totals, sorted descending, for the bar chart (View 2)
7. Grouping countries outside the top 7 by revenue into 'Other' for the color channel in View 3
"""

import pandas as pd
import json
import os

#loading 
df = pd.read_excel('Online_Retail.xlsx', parse_dates=['InvoiceDate'])

#cleaning data
df = df[df['Quantity'] > 0] #Quantity <= 0 means a return or correction
df = df[df['UnitPrice'] > 0] #UnitPrice <= 0 is not a real sale
df = df[~df['InvoiceNo'].astype(str).str.startswith('C')] #InvoiceNo starting with 'C' are cancellations
df = df.dropna(subset=['Description']) #missing product descriptions are dropped

# Getting coloumns that we need for the analysis
df['Revenue'] = df['Quantity'] * df['UnitPrice'] #Revenue = Quantity × UnitPrice

#Getting month,year and monthyear for the analysis
df['Month']     = df['InvoiceDate'].dt.month
df['Year']      = df['InvoiceDate'].dt.year
df['MonthYear'] = df['InvoiceDate'].dt.to_period('M').dt.to_timestamp()

#Getting the monthly totals for the time series (View 1)
monthly = (
    df.groupby('MonthYear')['Revenue']
    .sum()
    .reset_index()
)
monthly['MonthYear'] = monthly['MonthYear'].dt.strftime('%Y-%m-%d')
#One row per month used for the line chart
v1 = monthly.rename(columns={'MonthYear': 'date', 'Revenue': 'revenue'}).to_dict(orient='records') 

#Getting the country totals, sorted descending, for the bar chart (View 2)
by_country = (
    df.groupby('Country')['Revenue']
    .sum()
    .reset_index()
    .sort_values('Revenue', ascending=False) #sorted in descending order to get top countries
    .head(15)
)
v2 = by_country.rename(columns={'Country': 'country', 'Revenue': 'revenue'}).to_dict(orient='records')

#getting the top7 to use for View 3
top7 = by_country.head(7)['Country'].tolist()
print(f"Top 7 countries: {top7}")

#Getting the country totals, sorted descending, for the bar chart (View 2)
prod = df.groupby(['Description', 'Country']).agg(
    revenue=('Revenue', 'sum'),
    quantity=('Quantity', 'sum'),
    unitPrice=('UnitPrice', 'mean'),      #average unit price across invoices
    invoiceCount=('InvoiceNo', 'nunique') #number of distinct invoices
).reset_index()

# Remove any edge cases with zero revenue or quantity after aggregation
prod = prod[prod['revenue'] > 0]
prod = prod[prod['quantity'] > 0]

#liimitting to top 800 products by revenue to keep JSON file size manageable
prod = prod.nlargest(800, 'revenue')

#anything which is not the top 7 is marked as "Other"
prod['countryGroup'] = prod['Country'].apply(
    lambda c: c if c in top7 else 'Other'
)

v3 = (
    prod[['Description', 'countryGroup', 'revenue', 'quantity', 'unitPrice', 'invoiceCount']]
    .rename(columns={'countryGroup': 'country', 'Description': 'description'})
    .to_dict(orient='records')
)

#rounding to 2 decimal places to reduce size of json file
for row in v3:
    row['revenue']   = round(row['revenue'], 2)
    row['unitPrice'] = round(row['unitPrice'], 2)

print(f"V3 — Product rows: {len(v3)}")


#cross-filtering between View 1 and View 2. where each row represents revenue for one country in one month.
# When the user brushes a time range in View 1, View 2 filters this table.
cross = df.groupby(['MonthYear', 'Country'])['Revenue'].sum().reset_index()
cross['MonthYear'] = cross['MonthYear'].dt.strftime('%Y-%m-%d')
cross_data = (
    cross.rename(columns={'MonthYear': 'date', 'Country': 'country', 'Revenue': 'revenue'})
    .to_dict(orient='records')
)
print(f"Cross-filter rows: {len(cross_data)}")

# unique country list for dropdown, excluding "Unspecified"
all_countries = sorted([c for c in df['Country'].unique().tolist() if c != 'Unspecified'])

data = {
    'v1':          v1,           # 13 rows — monthly totals for line chart
    'v2':          v2,           # 15 rows — country totals for bar chart
    'v3':          v3,           # 800 rows — product scatter data
    'countries':   all_countries, # 38 entries — dropdown options
    'crossFilter': cross_data    # ~302 rows — month × country matrix
}

#exporting the data to json file in a compact format to reduce file size
output_path = 'data.json'
with open(output_path, 'w') as f:
    json.dump(data, f, separators=(',', ':'))  

size_kb = os.path.getsize(output_path) / 1024
