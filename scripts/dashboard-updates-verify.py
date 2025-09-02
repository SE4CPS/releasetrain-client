"""
Python script to:
1. Verify total count of updates in the last 7 days
2. Verify average number of updates in the last 7 days
3. Verify max number of updates in the last 7 days
4. Verify total count of update types to be 1,000
5. Verify total count of update sources to be 1,000
"""
import requests
from datetime import datetime, timedelta

# 1. Verify total count of updates in the last 7 days
actual_count = [158, 181, 229, 170, 91, 80, 114]
api_count = []
total_api_count = 0
total_chart_count = sum(actual_count)
print(f"-------------- Total count of updates in the last 7 days --------------")
for i in range(6, -1, -1):
    date = (datetime.today() - timedelta(days=i)).strftime('%Y%m%d')
    url = f'https://releasetrain.io/api/v/aggregate/byDate?date={date}'
    response = requests.get(url)
    data = response.json()
    total_api_count = data.get('count')
    api_count.append(total_api_count)
    total_chart_count = actual_count[6 - i]
    
    print(f"Date: {date}, Total (Chart): {total_chart_count}, Expected (API): {total_api_count},")
    #assert total_api_count == total_chart_count, f"{date}: API = {total_api_count}, Chart = {total_chart_count}"
    
# 2. Verify average number of updates in the last 7 days
average_api_count = sum(api_count) / 7
average_chart_count = sum(actual_count) / 7
print(f"\n-------------- Average number of updates in the last 7 days --------------")
print(f"Average (Chart): {int(average_chart_count)}")
print(f"Expected (API): {int(average_api_count)}")
#assert average_api_count == average_chart_count, f"{date}: API = {average_api_count}, Chart = {average_chart_count}"

# 3. Verify max number of updates in the last 7 days
max_api_count = max(api_count)
max_chart_count = max(actual_count)
print(f"\n-------------- Max number of updates in the last 7 days --------------")
print(f"Max (Chart): {int(max_chart_count)}")
print(f"Expected (API): {int(max_api_count)}")
#assert average_api_count == average_chart_count, f"{date}: API = {average_api_count}, Chart = {average_chart_count}"

# Get timestamp of oldest version in the last 1,000 updates
count = 1000
timestamp_url = f'https://releasetrain.io/api/aggregate/v/oldestTimestamp?count={count}'
timestamp_response = requests.get(timestamp_url)
timestamp_data = timestamp_response.json()
oldest = timestamp_data.get('oldest')
delta_in_days = timestamp_data.get('deltaInDays')
print(f"\n-------------- Oldest timestamp of the last 1,000 updates --------------")
print(f"oldest: {oldest}")
print(f"deltaInDays: {delta_in_days}")

# 4. Verify total count of update types to be 1,000
total_count_update_types = 0
print(f"\n-------------- Total count of types for the latest 1,000 updates --------------")
for i in range(delta_in_days):
    date = (datetime.today() - timedelta(days=i)).strftime('%Y%m%d')
    url = f'https://releasetrain.io/api/aggregate/v/updateTypeCount?timestamp={date}'
    response = requests.get(url)
    data = response.json()
    major = data.get('major')
    minor = data.get('minor')
    patch = data.get('patch')
    other = data.get('other')
    total_count_update_types += sum([major, minor, patch, other])
    print(f"Date: {date}, major: {major}, minor: {minor}, patch: {patch}, other:{other}")
    
print(f"Total type count for the last 1,000 updates: {total_count_update_types}")
print(f"Expected: 1000")

# 5. Verify total count of update sources to be 1,000
print(f"\n-------------- Total count of souces for the latest 1,000 updates --------------")
source_type = "CVE"
total_cve_updates = 0
for i in range(delta_in_days):
    date = (datetime.today() - timedelta(days=i)).strftime('%Y%m%d')
    url = f'https://releasetrain.io/api/aggregate/v/sourceCountByType?sourceType={source_type}&timestamp={date}'
    response = requests.get(url)
    data = response.json()
    count = data.get('count')
    total_cve_updates += count
    print(f"Date: {date}, sourceType: {source_type}, count: {count}")
    
print(f"Total type count for the latest {source_type} updates: {total_cve_updates}")
print(f"Total type count for the latest Other updates: {1000 - total_cve_updates}")
print(f"Expected: {total_count_update_types}")