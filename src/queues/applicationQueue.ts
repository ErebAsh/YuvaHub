/**
 * Application Processing Queue
 * 
 * Handles async application-related jobs:
 * - AI draft generation
 * - Application preparation
 * - Email/application workflow triggers
 */

import { Queue } from "bullmq";
import { connection } from "./connection";

export interface ApplicationJobData {
  userId: string;
  opportunityId: string;
  opportunityTitle: string;
  organization?: string;
  profile?: {
    name?: string;
    email?: string;
    skills?: string[];
    experience?: string;
  };
  action:
    | "generate_draft"
    | "prepare_application"
    | "send_application";
}

export const applicationQueue = new Queue<ApplicationJobData>(
  "application-processing",
  {
    connection: {
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379
},

    defaultJobOptions: {
      attempts: 3,

      backoff: {
        type: "exponential",
        delay: 5000,
      },

      removeOnComplete: {
        count: 100,
      },

      removeOnFail: {
        count: 50,
      },
    },
  }
);


/**
 * Add application task to queue
 */
export async function addApplicationJob(
  data: ApplicationJobData
) {
  return applicationQueue.add(
    data.action,
    data
  );
}