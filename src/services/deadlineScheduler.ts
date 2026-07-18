import { enqueueEmail } from "../queues/emailQueue";
import { enqueuePushNotification } from "../queues/pushQueue";
import { Notification } from "../models/notificationSchema";
import { getSocketIO } from "../../server";

export async function runDeadlineChecks(db: any): Promise<void> {
  if (!db) {
    console.error("[DeadlineScheduler] Database connection not available.");
    return;
  }

  console.log("[DeadlineScheduler] Starting daily deadline scan...");

  try {
    const usersCollection = db.collection("users");
    const oppsCollection = db.collection("opportunities");
    const notifCollection = db.collection("notifications");

    // Fetch all users who have bookmarks and have deadline reminders enabled
    const users = await usersCollection.find({
      bookmarks: { $exists: true, $not: { $size: 0 } }
    }).toArray();

    const now = new Date();

    for (const user of users) {
      const prefs = user.notificationPreferences || {
        emailEnabled: true,
        pushEnabled: true,
        deadlineRemindersEnabled: true,
        skillAlertsEnabled: true,
        scholarshipAlertsEnabled: true,
        hackathonAlertsEnabled: true,
        opportunityAlertsEnabled: true
      };

      if (!prefs.deadlineRemindersEnabled) {
        continue;
      }

      const bookmarks = user.bookmarks || [];
      
      for (const oppId of bookmarks) {
        let queryId;
        try {
          // MongoDB uses ObjectId for _id, but check fallback if it fails
          const { ObjectId } = await import("mongodb");
          queryId = new ObjectId(oppId);
        } catch {
          queryId = oppId;
        }

        const opportunity = await oppsCollection.findOne({
          $or: [
            { _id: queryId },
            { id: oppId }
          ]
        });

        if (!opportunity) {
          continue;
        }

        const deadlineStr = opportunity.deadline;
        if (!deadlineStr || deadlineStr.toLowerCase() === "tbd" || deadlineStr.toLowerCase() === "rolling") {
          continue;
        }

        const deadline = new Date(deadlineStr);
        if (isNaN(deadline.getTime())) {
          continue;
        }

        // Calculate difference in days
        const timeDiff = deadline.getTime() - now.getTime();
        const diffDays = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

        // We only trigger alerts on exactly 7, 3, 1, or 0 days remaining
        if (![7, 3, 1, 0].includes(diffDays)) {
          continue;
        }

        let title = `Deadline approaching in ${diffDays} days!`;
        let message = `Reminder: The deadline for bookmarked opportunity "${opportunity.title}" is in ${diffDays} days (${deadline.toLocaleDateString()}).`;

        if (diffDays === 0) {
          title = `Deadline is TODAY!`;
          message = `Urgent Reminder: Today is the last day to apply for bookmarked opportunity "${opportunity.title}".`;
        }

        // Check if user was already notified for this exact deadline condition (avoid duplicate alerts)
        const existing = await notifCollection.findOne({
          userId: user.uid,
          targetId: oppId,
          type: "deadline_reminder",
          title
        });

        if (existing) {
          continue;
        }

        // Create the notification document
        const notificationDoc: Notification = {
          userId: user.uid,
          type: "deadline_reminder",
          title,
          message,
          targetId: oppId,
          read: false,
          createdAt: new Date()
        };

        await notifCollection.insertOne(notificationDoc);
        console.log(`[DeadlineScheduler] Reminded user ${user.uid} of deadline for opportunity ${oppId} (${diffDays} days left)`);

        // Real-Time Socket.io push (foreground handling)
        const io = getSocketIO();
        if (io) {
          io.emit(`NOTIFICATION_RECEIVED_${user.uid}`, {
            id: oppId + "_" + diffDays,
            ...notificationDoc,
            time: "Just now"
          });
        }

        // Enqueue background email job
        if (prefs.emailEnabled && user.email) {
          await enqueueEmail({
            to: user.email,
            subject: `[YuvaHub] ${title}: ${opportunity.title}`,
            body: message
          });
        }

        // Enqueue background push job
        if (prefs.pushEnabled && user.fcmToken) {
          await enqueuePushNotification({
            userId: user.uid,
            message: `[YuvaHub] ${title}: ${opportunity.title}`
          });
        }
      }
    }
  } catch (err) {
    console.error("[DeadlineScheduler] Error running deadline reminders check:", err);
  }
}
