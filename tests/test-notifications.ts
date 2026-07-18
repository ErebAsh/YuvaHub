import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import { matchOpportunityAndNotify } from "../src/services/opportunityMatcher";
import { runDeadlineChecks } from "../src/services/deadlineScheduler";

dotenv.config();

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
const dbName = process.env.MONGODB_DB_NAME || "yuvahub";

async function testNotifications() {
  console.log("=================================================================");
  console.log("   YuvaHub Notification System Integration Testing              ");
  console.log("=================================================================");

  const client = new MongoClient(uri);
  try {
    await client.connect();
    console.log("[Database] Connected successfully to MongoDB.");
    const db = client.db(dbName);

    // 1. Create a dummy test user
    const usersCollection = db.collection("users");
    const testUser = {
      uid: "test_user_notification_sys_123",
      name: "Alice Tester",
      email: "alice@yuvahub.xyz",
      skills: ["React", "NodeJS", "Python"],
      bookmarks: ["opp_deadline_test_999"],
      notificationPreferences: {
        emailEnabled: true,
        pushEnabled: false,
        deadlineRemindersEnabled: true,
        skillAlertsEnabled: true,
        scholarshipAlertsEnabled: true,
        hackathonAlertsEnabled: true,
        opportunityAlertsEnabled: true
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await usersCollection.updateOne(
      { uid: testUser.uid },
      { $set: testUser },
      { upsert: true }
    );
    console.log("[Test User] Upserted dummy test user:", testUser.uid);

    // 2. Clear existing notifications for test user
    const notifCollection = db.collection("notifications");
    await notifCollection.deleteMany({ userId: testUser.uid });
    console.log("[Notifications] Cleared previous notifications for test user.");

    // 3. Test Opportunity Matchmaking (Skill-based alert)
    const testOpportunity = {
      id: "opp_skill_test_555",
      title: "Senior NodeJS Developer Role",
      organization: "Tech Corp",
      description: "Looking for an expert NodeJS developer with React experience.",
      category: "Job",
      tags: ["NodeJS", "TypeScript"],
      deadline: "2026-12-31T00:00:00Z"
    };

    console.log("\n--- Triggering skill-based opportunity matchmaking check ---");
    await matchOpportunityAndNotify(db, testOpportunity);

    const matches = await notifCollection.find({ userId: testUser.uid }).toArray();
    console.log(`[Result] Found ${matches.length} generated notifications:`);
    matches.forEach(m => {
      console.log(` - Title: "${m.title}" | Message: "${m.message}"`);
    });

    if (matches.length > 0) {
      console.log("[Success] Skill-based alert generated successfully.");
    } else {
      console.warn("[Fail] No skill-based alert generated.");
    }

    // 4. Test Deadline Reminders (Deadline alert)
    // Create an opportunity closing in exactly 3 days matching user's bookmark
    const testBookmarkedOpportunity = {
      id: "opp_deadline_test_999",
      _id: "opp_deadline_test_999",
      title: "MIT Hackathon 2026",
      organization: "MIT",
      category: "Hackathon",
      deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() // 3 days from now
    };

    const oppsCollection = db.collection("opportunities");
    await oppsCollection.updateOne(
      { id: testBookmarkedOpportunity.id },
      { $set: testBookmarkedOpportunity },
      { upsert: true }
    );
    console.log("\n[Test Opportunity] Upserted bookmarked deadline test opportunity:", testBookmarkedOpportunity.id);

    console.log("\n--- Triggering deadline scheduler reminders scan ---");
    await runDeadlineChecks(db);

    const deadlineMatches = await notifCollection.find({
      userId: testUser.uid,
      type: "deadline_reminder"
    }).toArray();

    console.log(`[Result] Found ${deadlineMatches.length} deadline notifications:`);
    deadlineMatches.forEach(m => {
      console.log(` - Title: "${m.title}" | Message: "${m.message}"`);
    });

    if (deadlineMatches.length > 0) {
      console.log("[Success] Deadline reminder generated successfully.");
    } else {
      console.warn("[Fail] No deadline reminder generated.");
    }

    // Clean up
    await usersCollection.deleteOne({ uid: testUser.uid });
    await oppsCollection.deleteOne({ id: testBookmarkedOpportunity.id });
    await notifCollection.deleteMany({ userId: testUser.uid });
    console.log("\n[Cleanup] Test metadata successfully purged from the database.");

  } catch (err: any) {
    console.error("Test failed with error:", err.message);
  } finally {
    await client.close();
  }
}

testNotifications();
