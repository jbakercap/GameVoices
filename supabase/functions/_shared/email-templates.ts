// Shared email templates for transactional emails

const baseStyles = `
  margin: 0;
  padding: 0;
  background: #f5f0e8;
`;

const containerStyles = `
  max-width: 600px;
  margin: 0 auto;
  padding: 40px 20px;
  font-family: 'Crimson Pro', Georgia, serif;
`;

const h1Styles = `
  font-size: 24px;
  color: #1a1a1a;
  margin-bottom: 16px;
  font-family: 'Crimson Pro', Georgia, serif;
`;

const textStyles = `
  color: #374151;
  font-size: 16px;
  line-height: 1.6;
  margin-bottom: 16px;
`;

const buttonStyles = `
  display: inline-block;
  background: #8B1538;
  color: #fff;
  padding: 12px 24px;
  border-radius: 6px;
  text-decoration: none;
  font-weight: 600;
`;

const footerStyles = `
  color: #6b7280;
  font-size: 14px;
  margin-top: 40px;
  border-top: 1px solid #d4c5a9;
  padding-top: 20px;
`;

// Logo HTML for emails
const logoHtml = `
  <div style="text-align: center; margin-bottom: 32px;">
    <table cellpadding="0" cellspacing="0" border="0" align="center">
      <tr>
        <td style="vertical-align: middle; padding-right: 8px;">
          <div style="width: 40px; height: 40px; background: #8B1538; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 3v14M5 8h10" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
            </svg>
          </div>
        </td>
        <td style="vertical-align: middle;">
          <span style="font-size: 20px; font-weight: 600; color: #1a1a1a; font-family: 'Crimson Pro', Georgia, serif;">GameVoices</span>
        </td>
      </tr>
    </table>
  </div>
`;

function wrapEmail(content: string): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;600;700&display=swap" rel="stylesheet">
  </head>
  <body style="${baseStyles}">
    <div style="${containerStyles}">
      ${logoHtml}
      ${content}
      <p style="${footerStyles}">
        GameVoices — Your Sports Podcast Hub
      </p>
    </div>
  </body>
</html>`;
}

export function claimApprovedEmail(showTitle: string, manageUrl: string): string {
  return wrapEmail(`
    <h1 style="${h1Styles}">Claim Approved!</h1>
    <p style="${textStyles}">
      Congratulations! You now own <strong>${showTitle}</strong> on GameVoices.
    </p>
    <p style="${textStyles}">
      You can now manage your podcast, update its details, and view analytics.
    </p>
    <div style="margin: 32px 0;">
      <a href="${manageUrl}" style="${buttonStyles}">
        Manage Your Podcast
      </a>
    </div>
  `);
}

export function claimRejectedEmail(
  showTitle: string, 
  rejectionReason?: string
): string {
  const reasonText = rejectionReason 
    ? `<p style="${textStyles}"><strong>Reason:</strong> ${rejectionReason}</p>`
    : '';

  return wrapEmail(`
    <h1 style="${h1Styles}">Update on Your Claim</h1>
    <p style="${textStyles}">
      We were unable to verify your ownership of <strong>${showTitle}</strong>.
    </p>
    ${reasonText}
    <p style="${textStyles}">
      If you believe this was an error, please try again with a different verification method 
      or contact our support team for assistance.
    </p>
    <div style="margin: 32px 0;">
      <a href="mailto:support@gamevoicespro.com" style="${buttonStyles}">
        Contact Support
      </a>
    </div>
  `);
}

export function submissionApprovedEmail(
  showTitle: string, 
  showUrl: string, 
  manageUrl: string
): string {
  return wrapEmail(`
    <h1 style="${h1Styles}">${showTitle} is Now Live!</h1>
    <p style="${textStyles}">
      Great news! Your podcast <strong>${showTitle}</strong> has been approved 
      and is now live on GameVoices.
    </p>
    <p style="${textStyles}">
      Your episodes have been imported and are available for listeners to discover.
    </p>
    <div style="margin: 32px 0;">
      <a href="${showUrl}" style="${buttonStyles}">
        View Your Podcast
      </a>
    </div>
    <div style="margin: 16px 0;">
      <a href="${manageUrl}" style="${buttonStyles.replace('#8B1538', '#374151')}">
        Manage Podcast
      </a>
    </div>
  `);
}

export function submissionRejectedEmail(
  showTitle: string | null,
  rejectionReason?: string
): string {
  const title = showTitle || 'your podcast submission';
  const reasonText = rejectionReason 
    ? `<p style="${textStyles}"><strong>Reason:</strong> ${rejectionReason}</p>`
    : '';

  return wrapEmail(`
    <h1 style="${h1Styles}">Update on Your Submission</h1>
    <p style="${textStyles}">
      Unfortunately, we were unable to approve <strong>${title}</strong> for GameVoices at this time.
    </p>
    ${reasonText}
    <p style="${textStyles}">
      You're welcome to submit again after addressing any issues, or contact our support team 
      if you have questions.
    </p>
    <div style="margin: 32px 0;">
      <a href="mailto:support@gamevoicespro.com" style="${buttonStyles}">
        Contact Support
      </a>
    </div>
  `);
}

export function welcomeEmail(appUrl: string): string {
  return wrapEmail(`
     <h1 style="${h1Styles}">Welcome to GameVoices!</h1>
     <p style="${textStyles}">
       Thanks for joining GameVoices — your hub for the best sports podcasts.
    </p>
    <p style="${textStyles}">
      Discover the best sports coverage, follow your favorite shows, and never miss a moment.
    </p>
    <div style="margin: 32px 0;">
      <a href="${appUrl}" style="${buttonStyles}">
        Start Listening
      </a>
    </div>
  `);
}

interface DigestEpisode {
  title: string;
  showTitle: string;
  showArtwork: string;
  episodeUrl: string;
  durationMinutes: number;
}

export function newEpisodesDigestEmail(
  episodes: DigestEpisode[], 
  appUrl: string
): string {
  const episodeCount = episodes.length;
  const plural = episodeCount === 1 ? 'episode' : 'episodes';
  
  const episodeListHtml = episodes.slice(0, 10).map(ep => `
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #d4c5a9;">
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td width="60" style="vertical-align: top;">
              <img src="${ep.showArtwork}" alt="" width="50" height="50" style="border-radius: 6px; display: block;" />
            </td>
            <td style="vertical-align: top; padding-left: 12px;">
              <a href="${ep.episodeUrl}" style="color: #1a1a1a; font-weight: 600; text-decoration: none; font-size: 15px; display: block; margin-bottom: 4px;">
                ${ep.title}
              </a>
              <span style="color: #6b7280; font-size: 13px;">
                ${ep.showTitle} · ${ep.durationMinutes} min
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `).join('');

  const moreText = episodeCount > 10 
    ? `<p style="${textStyles}">+ ${episodeCount - 10} more episodes</p>` 
    : '';

  return wrapEmail(`
    <h1 style="${h1Styles}">New Episodes from Your Shows</h1>
    <p style="${textStyles}">
      ${episodeCount} new ${plural} from shows you follow:
    </p>
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 24px 0;">
      ${episodeListHtml}
    </table>
    ${moreText}
    <div style="margin: 32px 0;">
      <a href="${appUrl}" style="${buttonStyles}">
        Listen Now
      </a>
    </div>
  `);
}
