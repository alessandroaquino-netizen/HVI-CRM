// Outreach email drafts. Pure text templates filled with what the system knows about the company and contact.
// Nothing is sent, stored or connected to Gmail: the text is shown on screen to be copied, edited and sent by hand.

export const DRAFT_TEMPLATES = [
  { id: 'intro',     label: 'First email (with a reason to reach out)' },
  { id: 'event',     label: 'After meeting at an event' },
  { id: 'followup',  label: 'Follow-up (no reply yet)' },
  { id: 'executive', label: 'To the CEO / president (sample shirt offer)' },
];

const PH = t => `[${t}]`;
const firstName = full => (String(full || '').trim().split(/\s+/)[0] || '');

// context: { company, contactName, contactTitle, angle, signal, executiveName, product, sender }
export function buildDraft(templateId, c) {
  const company = c.company || PH('company');
  const hi = firstName(c.contactName) ? `Hi ${firstName(c.contactName)},` : `Hi ${PH('first name')},`;
  const sender = c.sender || PH('your name');
  const product = c.product || 'button-ups, polos and flannels';
  const sig = `${sender}\nHigh Voltage Industries`;
  const hook = (c.angle && c.angle.trim()) || (c.signal && `I saw ${c.signal.trim().replace(/^[A-Z]/, m => m.toLowerCase()).replace(/\.$/, '')}.`) || PH('one line on why you are reaching out to them now');

  if (templateId === 'followup') {
    return {
      subject: `Re: custom shirts for ${company}`,
      body: `${hi}\n\nI wanted to follow up on my note about custom ${product} for ${company}. I know things get busy, so here is the short version: we build fully custom, crew-ready shirts for electrical contractors, and I would be glad to send photos or a sample so you can judge the quality yourself.\n\nWould a quick call or a reply here work this week?\n\n${sig}\n${PH('attach product visuals')}`,
    };
  }
  if (templateId === 'event') {
    return {
      subject: `Great meeting you, ${company}`,
      body: `${hi}\n\nIt was good to meet you ${PH('at the event / on the call')}. As promised, I am sending a few photos of the custom ${product} we make for electrical contractors.\n\n${c.signal ? `You mentioned ${c.signal.trim().replace(/\.$/, '')}; ` : `${PH('something specific you discussed')}; `}we can build that with your branding, fit and colors.\n\nWhat would be the best next step on your side?\n\n${sig}\n${PH('attach product visuals')}`,
    };
  }
  if (templateId === 'executive') {
    const exec = firstName(c.executiveName || c.contactName);
    return {
      subject: `A sample shirt for ${company}`,
      body: `${exec ? `Hi ${exec},` : `Hi ${PH('first name')},`}\n\nI work with electrical contractors on custom apparel, and ${company} came up as a company whose crews take pride in what they wear. ${hook}\n\nI would like to send you one of our custom button-ups as a sample, no obligation, so you can see the fabric and fit. Where should I ship it?\n\n${sig}\n${PH('attach product visuals')}`,
    };
  }
  return {
    subject: `Custom ${/button/i.test(product) ? 'button-ups' : 'shirts'} for ${company}`,
    body: `${hi}\n\n${hook}\n\nWe make fully custom ${product} for electrical contractors: your branding, crew-ready fit, and full-run production. I have attached a few photos of recent work.\n\nIf it is useful, I can put together a short proposal for ${company} or send a sample. Would you be open to a quick call or a reply here this week?\n\n${sig}\n${PH('attach product visuals')}`,
  };
}

export function placeholderCount(text) { return (String(text).match(/\[[^\]\n]{2,}\]/g) || []).length; }
