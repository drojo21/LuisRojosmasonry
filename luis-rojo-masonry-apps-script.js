// ═══════════════════════════════════════════
// DELIVERABLE 2 — GOOGLE APPS SCRIPT: LEAD CAPTURE
// Luis Rojo Masonry LLC
// ═══════════════════════════════════════════
//
// SETUP:
// 1. Go to https://script.google.com → New Project
// 2. Paste this code, replacing the default Code.gs
// 3. Run setupSheet() once to create the formatted spreadsheet
// 4. Run testSubmission() to verify email notifications work
// 5. Deploy → New deployment → Web app → Execute as: Me → Who has access: Anyone → Deploy
// 6. Copy the Web App URL → paste into your website's form JavaScript as GOOGLE_SHEET_URL
// 7. For daily summary: Edit → Triggers → Add → sendDailySummary → Time-driven → Day timer → 8am-9am
//
// ═══════════════════════════════════════════

const CONFIG = {
  SHEET_NAME: 'Leads',
  NOTIFICATION_EMAIL: 'luisr@luisrojosmasonry.com',
  BUSINESS_NAME: 'Luis Rojo Masonry LLC',
  BUSINESS_PHONE: '(520) 481-7179',
  BUSINESS_EMAIL: 'luisr@luisrojosmasonry.com',
  AUTO_REPLY: true,
  DAILY_SUMMARY: true,
  DAILY_SUMMARY_HOUR: 8
};

// ── Helper: get spreadsheet whether script is bound or standalone ──
function getSpreadsheet_() {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;
  // Standalone — find by name in Drive
  const files = DriveApp.getFilesByName(CONFIG.BUSINESS_NAME + ' — Leads');
  if (files.hasNext()) return SpreadsheetApp.open(files.next());
  return null;
}

// ── Handle incoming form submissions ──
function doPost(e) {
  try {
    let ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      // Standalone script — look for the sheet by name in Drive
      const files = DriveApp.getFilesByName(CONFIG.BUSINESS_NAME + ' — Leads');
      if (files.hasNext()) {
        ss = SpreadsheetApp.open(files.next());
      } else {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'No spreadsheet found. Run setupSheet() first.' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) {
      setupSheet();
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Sheet created. Please resubmit.' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    let data;
    if (e.postData) {
      data = JSON.parse(e.postData.contents);
    } else if (e.parameter) {
      data = e.parameter;
    } else {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'No data received' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const timestamp = new Date();
    const row = [
      timestamp,
      data.name || '',
      data.phone || '',
      data.email || '',
      data.service || '',
      data.description || '',
      data.timeline || '',
      'New',       // Status
      '',          // Notes
      data.source || 'Website'
    ];

    sheet.appendRow(row);

    // Send notification email
    sendNotificationEmail(data, timestamp);

    // Send auto-reply to customer
    if (CONFIG.AUTO_REPLY && data.email) {
      sendAutoReply(data);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'success' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('doPost error: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── Setup sheet with headers, formatting, and dropdowns ──
// NOTE: For best results, open a Google Sheet FIRST, then go to
// Extensions → Apps Script and paste this code there. That binds the
// script to the sheet. If you created a standalone project at
// script.google.com instead, this function will create a new
// spreadsheet automatically and log the URL.
function setupSheet() {
  let ss = SpreadsheetApp.getActiveSpreadsheet();

  // If running as a standalone script (not bound to a sheet), create one
  if (!ss) {
    ss = SpreadsheetApp.create(CONFIG.BUSINESS_NAME + ' — Leads');
    Logger.log('Created new spreadsheet: ' + ss.getUrl());
    // Show the URL so the user can find it
    try {
      SpreadsheetApp.getUi().alert(
        'No spreadsheet was attached, so a new one was created:\n\n' +
        ss.getUrl() + '\n\n' +
        'Bookmark that link! The sheet is also in your Google Drive.'
      );
    } catch (e) {
      // getUi() fails in standalone context — that's OK, the log has the URL
      Logger.log('Open your new lead tracking sheet at: ' + ss.getUrl());
    }
  }

  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
  }

  // Headers
  const headers = ['Timestamp', 'Name', 'Phone', 'Email', 'Service Type', 'Project Description', 'Timeline', 'Status', 'Notes', 'Source'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // Format headers
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#78350f');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  headerRange.setFontSize(11);
  headerRange.setHorizontalAlignment('center');

  // Column widths
  sheet.setColumnWidth(1, 160); // Timestamp
  sheet.setColumnWidth(2, 150); // Name
  sheet.setColumnWidth(3, 130); // Phone
  sheet.setColumnWidth(4, 200); // Email
  sheet.setColumnWidth(5, 160); // Service Type
  sheet.setColumnWidth(6, 300); // Description
  sheet.setColumnWidth(7, 130); // Timeline
  sheet.setColumnWidth(8, 100); // Status
  sheet.setColumnWidth(9, 200); // Notes
  sheet.setColumnWidth(10, 100); // Source

  // Status dropdown (column 8) for rows 2-500
  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['New', 'Contacted', 'Quoted', 'Scheduled', 'Completed', 'Lost'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 8, 499, 1).setDataValidation(statusRule);

  // Conditional formatting for Status column
  const statusRange = sheet.getRange('H2:H500');

  // New = amber
  const newRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('New')
    .setBackground('#fef3c7')
    .setFontColor('#92400e')
    .setRanges([statusRange])
    .build();

  // Contacted = blue
  const contactedRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Contacted')
    .setBackground('#dbeafe')
    .setFontColor('#1e40af')
    .setRanges([statusRange])
    .build();

  // Quoted = purple
  const quotedRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Quoted')
    .setBackground('#ede9fe')
    .setFontColor('#6b21a8')
    .setRanges([statusRange])
    .build();

  // Scheduled = green
  const scheduledRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Scheduled')
    .setBackground('#d1fae5')
    .setFontColor('#065f46')
    .setRanges([statusRange])
    .build();

  // Completed = dark green
  const completedRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Completed')
    .setBackground('#065f46')
    .setFontColor('#ffffff')
    .setRanges([statusRange])
    .build();

  // Lost = red
  const lostRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Lost')
    .setBackground('#fee2e2')
    .setFontColor('#991b1b')
    .setRanges([statusRange])
    .build();

  sheet.setConditionalFormatRules([newRule, contactedRule, quotedRule, scheduledRule, completedRule, lostRule]);

  // Freeze header row
  sheet.setFrozenRows(1);

  Logger.log('Sheet setup complete!');
  SpreadsheetApp.getUi().alert('Lead tracking sheet is ready! Now run testSubmission() to verify email notifications.');
}

// ── Send notification email to business owner ──
function sendNotificationEmail(data, timestamp) {
  const timeline = (data.timeline || 'Flexible').toLowerCase();
  let urgencyColor = '#22c55e'; // green
  let urgencyLabel = 'STANDARD';

  if (timeline.includes('within 2 weeks') || timeline.includes('this week')) {
    urgencyColor = '#f59e0b'; // yellow
    urgencyLabel = 'THIS MONTH';
  }
  if (timeline.includes('asap') || timeline.includes('emergency') || timeline.includes('urgent')) {
    urgencyColor = '#ef4444'; // red
    urgencyLabel = 'URGENT';
  }

  const emailHtml = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:${urgencyColor};color:#fff;padding:16px 24px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;font-size:18px;">New Lead — ${urgencyLabel}</h2>
        <p style="margin:4px 0 0;font-size:13px;opacity:0.9;">${CONFIG.BUSINESS_NAME}</p>
      </div>
      <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px 0;color:#6b7280;width:120px;vertical-align:top;"><strong>Name</strong></td><td style="padding:8px 0;">${data.name || 'Not provided'}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;vertical-align:top;"><strong>Phone</strong></td><td style="padding:8px 0;"><a href="tel:${(data.phone || '').replace(/\D/g,'')}" style="color:#78350f;font-weight:bold;">${data.phone || 'Not provided'}</a></td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;vertical-align:top;"><strong>Email</strong></td><td style="padding:8px 0;"><a href="mailto:${data.email || ''}" style="color:#78350f;">${data.email || 'Not provided'}</a></td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;vertical-align:top;"><strong>Service</strong></td><td style="padding:8px 0;">${data.service || 'Not specified'}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;vertical-align:top;"><strong>Timeline</strong></td><td style="padding:8px 0;">${data.timeline || 'Flexible'}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;vertical-align:top;"><strong>Description</strong></td><td style="padding:8px 0;">${data.description || 'No details provided'}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;vertical-align:top;"><strong>Source</strong></td><td style="padding:8px 0;">${data.source || 'Website'}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;vertical-align:top;"><strong>Time</strong></td><td style="padding:8px 0;">${timestamp ? timestamp.toLocaleString() : new Date().toLocaleString()}</td></tr>
        </table>
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e5e7eb;">
          <a href="tel:${(data.phone || '').replace(/\D/g,'')}" style="display:inline-block;background:#78350f;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:bold;margin-right:8px;">Call Lead</a>
          ${data.email ? `<a href="mailto:${data.email}" style="display:inline-block;background:#d97706;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Email Lead</a>` : ''}
        </div>
      </div>
    </div>
  `;

  MailApp.sendEmail({
    to: CONFIG.NOTIFICATION_EMAIL,
    subject: `New Lead: ${data.name || 'Unknown'} — ${data.service || 'General Inquiry'} [${urgencyLabel}]`,
    htmlBody: emailHtml,
    replyTo: data.email || CONFIG.BUSINESS_EMAIL
  });
}

// ── Send auto-reply to the customer ──
function sendAutoReply(data) {
  const replyHtml = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#78350f;color:#fff;padding:24px;border-radius:8px 8px 0 0;text-align:center;">
        <h1 style="margin:0;font-size:22px;">${CONFIG.BUSINESS_NAME}</h1>
        <p style="margin:8px 0 0;opacity:0.9;font-size:14px;">Built Solid. Built to Last.</p>
      </div>
      <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
        <p style="font-size:16px;color:#1f2937;">Hi ${data.name || 'there'},</p>
        <p style="color:#4b5563;line-height:1.7;">Thank you for reaching out to ${CONFIG.BUSINESS_NAME}! We received your request for <strong>${data.service || 'our services'}</strong> and will review it shortly.</p>
        <p style="color:#4b5563;line-height:1.7;">You can expect to hear from us within <strong>24 hours</strong>. If your project is time-sensitive, feel free to call us directly:</p>
        <div style="text-align:center;margin:24px 0;">
          <a href="tel:${CONFIG.BUSINESS_PHONE.replace(/\D/g,'')}" style="display:inline-block;background:#d97706;color:#fff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">${CONFIG.BUSINESS_PHONE}</a>
        </div>
        <p style="color:#4b5563;line-height:1.7;">We appreciate your interest and look forward to discussing your project.</p>
        <p style="color:#1f2937;font-weight:bold;margin-top:24px;">— Luis Rojo<br><span style="font-weight:normal;color:#6b7280;">${CONFIG.BUSINESS_NAME}<br>AZ ROC #337881</span></p>
      </div>
    </div>
  `;

  MailApp.sendEmail({
    to: data.email,
    subject: `We received your request — ${CONFIG.BUSINESS_NAME}`,
    htmlBody: replyHtml,
    replyTo: CONFIG.BUSINESS_EMAIL,
    name: CONFIG.BUSINESS_NAME
  });
}

// ── Daily summary email ──
function sendDailySummary() {
  const ss = getSpreadsheet_();
  if (!ss) return;
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) return;

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return; // Only headers

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  let newLeads = [];
  let statusCounts = { 'New': 0, 'Contacted': 0, 'Quoted': 0, 'Scheduled': 0, 'Completed': 0, 'Lost': 0 };

  for (let i = 1; i < data.length; i++) {
    const rowDate = new Date(data[i][0]);
    const status = data[i][7] || 'New';
    statusCounts[status] = (statusCounts[status] || 0) + 1;

    if (rowDate >= yesterday) {
      newLeads.push({
        name: data[i][1],
        phone: data[i][2],
        service: data[i][4],
        timeline: data[i][6]
      });
    }
  }

  const totalLeads = data.length - 1;

  let leadsHtml = '';
  if (newLeads.length > 0) {
    leadsHtml = newLeads.map(l =>
      `<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;">${l.name}</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;">${l.phone}</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;">${l.service}</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;">${l.timeline}</td></tr>`
    ).join('');
  } else {
    leadsHtml = '<tr><td colspan="4" style="padding:16px;text-align:center;color:#6b7280;">No new leads in the last 24 hours</td></tr>';
  }

  const summaryHtml = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#78350f;color:#fff;padding:16px 24px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;">Daily Lead Summary</h2>
        <p style="margin:4px 0 0;opacity:0.9;font-size:13px;">${CONFIG.BUSINESS_NAME} — ${now.toLocaleDateString()}</p>
      </div>
      <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;">
        <div style="display:flex;gap:16px;margin-bottom:24px;text-align:center;">
          <div style="flex:1;background:#fff;padding:16px;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
            <div style="font-size:28px;font-weight:bold;color:#78350f;">${newLeads.length}</div>
            <div style="font-size:12px;color:#6b7280;text-transform:uppercase;">New (24h)</div>
          </div>
          <div style="flex:1;background:#fff;padding:16px;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
            <div style="font-size:28px;font-weight:bold;color:#d97706;">${totalLeads}</div>
            <div style="font-size:12px;color:#6b7280;text-transform:uppercase;">Total Leads</div>
          </div>
          <div style="flex:1;background:#fff;padding:16px;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
            <div style="font-size:28px;font-weight:bold;color:#22c55e;">${statusCounts['Scheduled'] || 0}</div>
            <div style="font-size:12px;color:#6b7280;text-transform:uppercase;">Scheduled</div>
          </div>
        </div>
        <h3 style="margin:0 0 12px;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:#78350f;">New Leads (Last 24 Hours)</h3>
        <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;">
          <tr style="background:#78350f;color:#fff;"><th style="padding:10px 8px;text-align:left;font-size:12px;">Name</th><th style="padding:10px 8px;text-align:left;font-size:12px;">Phone</th><th style="padding:10px 8px;text-align:left;font-size:12px;">Service</th><th style="padding:10px 8px;text-align:left;font-size:12px;">Timeline</th></tr>
          ${leadsHtml}
        </table>
        <h3 style="margin:24px 0 12px;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:#78350f;">Pipeline Status</h3>
        <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;">
          <tr><td style="padding:6px 8px;">New</td><td style="padding:6px 8px;font-weight:bold;">${statusCounts['New']}</td></tr>
          <tr><td style="padding:6px 8px;">Contacted</td><td style="padding:6px 8px;font-weight:bold;">${statusCounts['Contacted']}</td></tr>
          <tr><td style="padding:6px 8px;">Quoted</td><td style="padding:6px 8px;font-weight:bold;">${statusCounts['Quoted']}</td></tr>
          <tr><td style="padding:6px 8px;">Scheduled</td><td style="padding:6px 8px;font-weight:bold;">${statusCounts['Scheduled']}</td></tr>
          <tr><td style="padding:6px 8px;">Completed</td><td style="padding:6px 8px;font-weight:bold;">${statusCounts['Completed']}</td></tr>
          <tr><td style="padding:6px 8px;">Lost</td><td style="padding:6px 8px;font-weight:bold;">${statusCounts['Lost']}</td></tr>
        </table>
      </div>
    </div>
  `;

  MailApp.sendEmail({
    to: CONFIG.NOTIFICATION_EMAIL,
    subject: `Daily Summary: ${newLeads.length} new lead(s) — ${CONFIG.BUSINESS_NAME}`,
    htmlBody: summaryHtml
  });
}

// ── Test submission — run this to verify everything works ──
function testSubmission() {
  const testData = {
    name: 'Test Customer',
    phone: '(520) 555-0199',
    email: CONFIG.NOTIFICATION_EMAIL, // sends to yourself
    service: 'Backyard Pavers',
    description: 'This is a test submission to verify the lead capture system is working. You can delete this row from the sheet.',
    timeline: 'Within 2 weeks',
    source: 'Test'
  };

  const ss = getSpreadsheet_();
  if (!ss) {
    Logger.log('No spreadsheet found. Run setupSheet() first.');
    try { SpreadsheetApp.getUi().alert('No spreadsheet found. Run setupSheet() first.'); } catch(e) {}
    return;
  }
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    Logger.log('Leads sheet not found. Run setupSheet() first.');
    try { SpreadsheetApp.getUi().alert('Leads sheet not found. Run setupSheet() first.'); } catch(e) {}
    return;
  }

  const timestamp = new Date();
  sheet.appendRow([
    timestamp,
    testData.name,
    testData.phone,
    testData.email,
    testData.service,
    testData.description,
    testData.timeline,
    'New',
    'TEST — safe to delete',
    testData.source
  ]);

  sendNotificationEmail(testData, timestamp);

  if (CONFIG.AUTO_REPLY) {
    sendAutoReply(testData);
  }

  SpreadsheetApp.getUi().alert(
    'Test complete!\n\n' +
    '1. Check your sheet — a test row was added\n' +
    '2. Check your email — you should receive a notification\n' +
    '3. If AUTO_REPLY is on, you\'ll also get a customer confirmation email\n\n' +
    'If everything looks good, deploy as a Web App!'
  );
}
