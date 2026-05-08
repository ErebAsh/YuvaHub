# Yuvahub.xyz - Live Opportunity Intelligence System

This document outlines the transition of Yuvahub from a static search engine to a **Live Opportunity Intelligence System** with event-driven feed injection, incremental updates, and real-time alerts.

## 1. Event-Driven Architecture

The core of this system is an event-driven pub/sub architecture built on **Apache Kafka** or **Redis Streams**.

1.  **Ingestion:** Distributed scrapers run continuously. When an opportunity is found, it is normalized and pushed to an `opportunities_raw` topic.
2.  **Deduplication & Classification:** A worker consumes the raw topic, uses AI/NLP to extract tags, checks for unique fingerprints in MongoDB, and if new, pushes it to the `opportunities_classified` topic.
3.  **Live Matching Engine:** A stream processor (like Faust or standard Celery workers) listens to `opportunities_classified`. It immediately finds matching users and injects the opportunity ID into their cached feeds.
4.  **Notification Pipeline:** Simultaneously, the worker checks user notification preferences and queues push notifications/emails.

## 2. Feed Injection System

Instead of a user "pulling" a new feed, the system "pushes" updates into the user's feed cache.
*   **MongoDB `CachedFeed`:** Contains an array of `opportunity_ids` for a user.
*   **Insertion Logic ($push with $position):** When a new match is found, the system uses MongoDB's `$push` with `$position: 0` to blindly insert the new `opportunity_id` at the very top of the user's feed, marking it as `is_read = False`.

## 3. Real-time Recommendation Flow

When a new opportunity (e.g., "AI Hackathon in Pune") enters the DB:
1.  **Targeting Query:** The system runs a fast reverse-query: `db.users.find({ "interests": { $in: ["AI/ML"] }, "location": "Pune" })`.
2.  **Scoring Injection:** For the matching users, calculate a quick relevance score.
3.  **Threshold Gate:** If `score > 0.8`, push it to the user's `CachedFeed` array.
4.  **Signal Frontend:** If the user has an active WebSocket connection, send a `NEW_OPPORTUNITY` payload so the UI shows a "New Opportunities Available" floating pill.

## 4. Database Updates (MongoDB Schemas)

```python
from datetime import datetime
from pydantic import Field
from beanie import Document
from typing import List, Optional

class OpportunityFingerprintIndex(Document):
    fingerprint: str = Field(unique=True)
    opportunity_id: str
    discovered_at: datetime
    
class ViewedOpportunity(Document):
    user_id: str
    opportunity_id: str
    viewed_at: datetime

class UserFeedUpdate(Document):
    # For queuing feed invalidations/updates
    user_id: str
    pending_opportunity_ids: List[str]
    has_notified: bool = False
```

## 5. Cron Workflow (Fallback & Catch-up)

While the main system is event-driven, Cron is still required for consistency:
-   **Hourly Catch-up:** Re-scores feeds for users who haven't logged in recently using batch processing.
-   **Daily Pruning:** Removes ancient or expired opportunities from feed caches.
-   **Scraper Orchestration:** Triggers specific deep-scrapes on heavy JavaScript websites that can't be scraped continuously.

## 6. Feed Persistence Strategy

*   **Hot Tier (Redis):** Stores the first 100 items of a user's feed. Extremely fast reads for the `Dashboard`.
*   **Cold Tier (MongoDB):** Backs up the entire feed. If a user scrolls past 100 items, pagination fetches from MongoDB.
*   **No Wipeouts:** The feed is an append-only log conceptually. Old items naturally fall down the list. We never delete items from the feed unless the opportunity deadline has passed.

## 7. Notification Pipeline

1.  **Event:** User is matched with a new high-priority opportunity.
2.  **Debouncer:** Instead of sending 5 emails a day, the system holds notifications in Redis for 4 hours.
3.  **Delivery System:**
    *   *Push Notification (FCM/APNs):* Sent immediately for "Urgent" matches (e.g., deadline in 24h).
    *   *Email Summary (SendGrid):* "Your Daily Opportunity Matches" sent at 9 AM.
    *   *Telegram Bot:* For users who linked their accounts, immediate delivery.

## 8. Incremental Update Algorithm

When the frontend calls `/api/feed?mode=smart&last_sync_timestamp=X`:
1.  Backend checks the user's `CachedFeed` for items inserted *after* `last_sync_timestamp`.
2.  Returns only the `delta` (newly added items).
3.  Frontend prepends the `delta` to its local state array.

## 9. Example Backend Code (Worker/Matcher)

```python
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def process_new_opportunity(opportunity: dict, db):
    """
    Called by Kafka/Redis stream when a scraper saves a new opportunity.
    """
    # 1. Reverse Targeting
    matched_users = db.users.find({
        "interests": { "$in": opportunity.get("tags", []) }
    })
    
    # 2. Feed Injection Batch
    bulk_ops = []
    notif_queue = []
    
    async for user in matched_users:
        feed_item = {
            "opportunity_id": opportunity["_id"],
            "added_at": datetime.utcnow(),
            "is_read": False
        }
        # Push to top of feed
        bulk_ops.append(
            UpdateOne(
                {"user_id": user["user_id"], "mode": "smart"},
                {"$push": {"items": {"$each": [feed_item], "$position": 0}}}
            )
        )
        if opportunity.get("is_high_value"):
            notif_queue.append((user["user_id"], opportunity["title"]))
            
    # 3. Execute
    if bulk_ops:
        await db.cached_feeds.bulk_write(bulk_ops)
        
    # 4. Trigger Notifications (to pub/sub)
    if notif_queue:
        await trigger_push_notifications(notif_queue)

```
