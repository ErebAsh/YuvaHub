export function generateOpportunityAlertHtml(title: string, org: string, category: string, link: string, desc: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #2563eb; margin-bottom: 5px;">[YuvaHub] Match Found!</h2>
      <p style="color: #666; font-size: 14px; margin-top: 0;">New matching ${category || "opportunity"} matches your skills.</p>
      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
      <h3 style="color: #1e293b; margin: 0 0 10px 0;">${title}</h3>
      <p style="margin: 0 0 15px 0; color: #475569; font-weight: 500;">at <strong>${org}</strong></p>
      <p style="color: #334155; line-height: 1.5; font-size: 14px; background-color: #f8fafc; padding: 12px; border-radius: 6px; border-left: 4px solid #3b82f6;">
        ${desc || "No description provided."}
      </p>
      <div style="margin-top: 25px; text-align: center;">
        <a href="${link || "https://yuvahub.xyz"}" target="_blank" style="background-color: #2563eb; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          Apply Now
        </a>
      </div>
      <p style="color: #94a3b8; font-size: 11px; text-align: center; margin-top: 30px;">
        You received this because of your notification settings on YuvaHub. You can update your preferences anytime.
      </p>
    </div>
  `;
}

export function generateDeadlineReminderHtml(title: string, org: string, deadline: string, diffDays: number): string {
  const urgencyColor = diffDays === 0 ? "#dc2626" : diffDays === 1 ? "#ea580c" : "#d97706";
  const daysText = diffDays === 0 ? "TODAY" : diffDays === 1 ? "tomorrow" : `in ${diffDays} days`;

  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: ${urgencyColor}; margin-bottom: 5px;">⏰ Deadline Reminder</h2>
      <p style="color: #666; font-size: 14px; margin-top: 0;">An opportunity you bookmarked is closing soon.</p>
      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
      <h3 style="color: #1e293b; margin: 0 0 10px 0;">${title}</h3>
      <p style="margin: 0 0 15px 0; color: #475569; font-weight: 500;">at <strong>${org}</strong></p>
      
      <div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 6px; padding: 15px; margin: 20px 0;">
        <span style="font-size: 13px; color: #92400e; font-weight: bold; text-transform: uppercase; display: block; margin-bottom: 5px;">Time Remaining</span>
        <span style="font-size: 18px; color: ${urgencyColor}; font-weight: 900;">Closing ${daysText} (${deadline})</span>
      </div>

      <div style="margin-top: 25px; text-align: center;">
        <a href="https://yuvahub.xyz" target="_blank" style="background-color: #1e293b; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          View Bookmark
        </a>
      </div>
      <p style="color: #94a3b8; font-size: 11px; text-align: center; margin-top: 30px;">
        You received this because of your notification settings on YuvaHub. You can update your preferences anytime.
      </p>
    </div>
  `;
}

export function generateScholarshipAlertHtml(title: string, provider: string, link: string, desc: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #059669; margin-bottom: 5px;">🎓 Scholarship Alert</h2>
      <p style="color: #666; font-size: 14px; margin-top: 0;">A new scholarship matches your eligibility profile.</p>
      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
      <h3 style="color: #1e293b; margin: 0 0 10px 0;">${title}</h3>
      <p style="margin: 0 0 15px 0; color: #475569; font-weight: 500;">Provider: <strong>${provider}</strong></p>
      <p style="color: #334155; line-height: 1.5; font-size: 14px; background-color: #f0fdf4; padding: 12px; border-radius: 6px; border-left: 4px solid #10b981;">
        ${desc || "No description provided."}
      </p>
      <div style="margin-top: 25px; text-align: center;">
        <a href="${link || "https://yuvahub.xyz"}" target="_blank" style="background-color: #059669; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          Check Eligibility
        </a>
      </div>
      <p style="color: #94a3b8; font-size: 11px; text-align: center; margin-top: 30px;">
        You received this because of your notification settings on YuvaHub. You can update your preferences anytime.
      </p>
    </div>
  `;
}

export function generateHackathonAlertHtml(title: string, organization: string, deadline: string, link: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #7c3aed; margin-bottom: 5px;">🏆 Hackathon Alert</h2>
      <p style="color: #666; font-size: 14px; margin-top: 0;">Assemble your team! A new hackathon has opened registrations.</p>
      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
      <h3 style="color: #1e293b; margin: 0 0 10px 0;">${title}</h3>
      <p style="margin: 0 0 15px 0; color: #475569; font-weight: 500;">Organizer: <strong>${organization}</strong></p>
      <p style="margin: 0 0 15px 0; color: #6d28d9; font-size: 14px; font-weight: 600;">Registration Deadline: ${deadline || "TBD"}</p>
      <div style="margin-top: 25px; text-align: center;">
        <a href="${link || "https://yuvahub.xyz"}" target="_blank" style="background-color: #7c3aed; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          Register Now
        </a>
      </div>
      <p style="color: #94a3b8; font-size: 11px; text-align: center; margin-top: 30px;">
        You received this because of your notification settings on YuvaHub. You can update your preferences anytime.
      </p>
    </div>
  `;
}
