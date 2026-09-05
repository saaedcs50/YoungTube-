import re
import csv
import json
import time
import pandas as pd
from youtubesearchpython import ChannelsSearch

INPUT_FILE = "CHANNELS_MASTER.md"

CATEGORY_MAP = {
    "STORIES": "stories",
    "SONGS": "songs",
    "LEARN": "learn",
    "GAMING": "gaming",
    "FAITH": "faith",
    "ARTS": "arts",
    "CALM": "calm",
    "ACTIVE": "active",
    "SPORTS": "sports",
    "DRAWING": "drawing",
    "SHOWS": "shows",
    "READING": "reading",
    "COOKING": "cooking"
}

categories = {}
current_category = None

with open(INPUT_FILE, "r", encoding="utf-8") as f:
    lines = f.readlines()

for line in lines:
    header_match = re.match(r"##\s+([A-Z]+)", line)
    if header_match:
        cat = header_match.group(1)
        if cat in CATEGORY_MAP:
            current_category = CATEGORY_MAP[cat]
            if current_category not in categories:
                categories[current_category] = []
        continue

    if line.strip().startswith("|"):
        cols = [c.strip() for c in line.strip().split("|")]
        if len(cols) >= 3:
            channel_name = cols[1]
            if (
                channel_name
                and channel_name != "القناة"
                and not channel_name.startswith("---")
            ):
                if current_category:
                    categories[current_category].append(channel_name)

all_unique_channels = set()
for cat in categories:
    all_unique_channels.update(categories[cat])

print(f"Unique channels found in master file: {len(all_unique_channels)}")

def get_search_queries(raw_name):
    queries = [raw_name]
    cleaned = re.sub(r'\(.*?\)', '', raw_name).strip()
    if cleaned and cleaned not in queries:
        queries.append(cleaned)
    inside = re.findall(r'\((.*?)\)', raw_name)
    for item in inside:
        item = item.strip()
        if item and not any(w in item for w in ['محتوى', 'تختار', 'تراجع', 'إيقاع', 'حلقات', 'أجزاء', 'بعض', 'الرسمية']):
            if item not in queries:
                queries.append(item)
    if '/' in raw_name:
        for part in raw_name.split('/'):
            part = part.strip()
            if part and part not in queries:
                queries.append(part)
    if ' - ' in raw_name:
        for part in raw_name.split(' - '):
            part = part.strip()
            if part and part not in queries:
                queries.append(part)
    return queries

results = []
channels_list = sorted(list(all_unique_channels))

for i, channel in enumerate(channels_list, 1):
    # Skip obvious placeholder notes
    if any(placeholder in channel for placeholder in ['Some mobile game channels', 'قنوات رسم عربية أخرى']):
        print(f"[{i}/{len(channels_list)}] Skipping note/placeholder: {channel}", flush=True)
        results.append({
            "channel_name": channel,
            "channel_id": "SKIPPED_NOTE",
            "title_found": "",
            "subscribers": "",
            "link": "",
            "thumbnail": ""
        })
        continue

    queries = get_search_queries(channel)
    found = False
    row = {
        "channel_name": channel,
        "channel_id": "NOT_FOUND",
        "title_found": "",
        "subscribers": "",
        "link": "",
        "thumbnail": ""
    }

    for q in queries:
        try:
            search = ChannelsSearch(q, limit=1)
            data = search.result()
            if data and data.get("result") and len(data["result"]) > 0:
                ch = data["result"][0]
                ch_id = ch.get("id", "")
                if ch_id:
                    thumbs = ch.get("thumbnails", [])
                    thumb_url = thumbs[0]["url"] if thumbs else ""
                    if thumb_url.startswith("//"):
                        thumb_url = "https:" + thumb_url

                    row = {
                        "channel_name": channel,
                        "channel_id": ch_id,
                        "title_found": ch.get("title", ""),
                        "subscribers": ch.get("subscribers", ""),
                        "link": ch.get("link", ""),
                        "thumbnail": thumb_url
                    }
                    found = True
                    break
        except Exception as e:
            pass

    if found:
        print(f"[{i}/{len(channels_list)}] OK: {channel} -> {row['channel_id']} ({row['title_found']})", flush=True)
    else:
        print(f"[{i}/{len(channels_list)}] NOT FOUND: {channel}", flush=True)

    results.append(row)
    time.sleep(0.3)

# Save Master CSV
df_all = pd.DataFrame(results)
df_all.to_csv("all_channels.csv", index=False, encoding="utf-8-sig")

# Save Category CSVs
for category_name, ch_list in categories.items():
    subset = df_all[df_all["channel_name"].isin(ch_list)]
    subset.to_csv(f"{category_name}.csv", index=False, encoding="utf-8-sig")

# Also generate a structured JSON with categories for direct use in the app seed
json_data = []
for res in results:
    if res["channel_id"].startswith("UC"):
        cats = [cat for cat, ch_list in categories.items() if res["channel_name"] in ch_list]
        json_data.append({
            "sourceId": res["channel_id"],
            "sourceType": "channel",
            "title": res["title_found"] or res["channel_name"],
            "originalName": res["channel_name"],
            "thumbnail": res["thumbnail"],
            "categories": cats,
            "link": res["link"]
        })

with open("channels_seed.json", "w", encoding="utf-8") as f:
    json.dump(json_data, f, ensure_ascii=False, indent=2)

print(f"\nALL DONE! Successfully extracted channels. Total valid: {len(json_data)}/{len(channels_list)}")
