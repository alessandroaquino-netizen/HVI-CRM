export const STAGES = [
  'Prospect', 'Contacted', 'Discovery Call', 'Qualified',
  'Proposal Sent', 'Negotiation', 'Closed Won', 'Closed Lost', 'Not Qualified',
];

export const PIPELINE_STAGES = [
  'Prospect', 'Contacted', 'Discovery Call', 'Qualified',
  'Proposal Sent', 'Negotiation', 'Closed Won',
];

export const SEGMENTS = [
  'High voltage contractor', 'Utility company', 'Union local', 'Other',
];

export const PROJECT_STATUSES = ['To be Started', 'In Progress', 'On Hold', 'Complete'];

export const TEAM_MEMBERS = ['Alessandro', 'Tony', 'Adriana'];

export const DISC = {
  D: {
    label: 'Dominant',
    color: '#5b9cf6',
    bg: 'rgba(91,156,246,.15)',
    desc: 'Direct, results-driven, decisive. Hates wasted time.',
    talk: 'Lead with outcomes and ROI. Be direct. No small talk unless they start it. Give them options, not a pitch.',
    close: "Make it easy to say yes fast. Clear price, clear timeline, clear next step. Don't over-explain.",
    avoid: 'Long presentations. Vague timelines. Checking in too much. Telling them what to do.',
  },
  I: {
    label: 'Influential',
    color: '#4caf7d',
    bg: 'rgba(76,175,125,.15)',
    desc: 'Enthusiastic, relationship-first, big picture thinker.',
    talk: 'Build the relationship first. Match their energy. Talk about the crew, the identity, the pride behind the gear.',
    close: "Get them excited about what their team will look like. They'll sell it internally for you.",
    avoid: 'Leading with specs or data. Being cold or transactional. Rushing past the relationship.',
  },
  S: {
    label: 'Steady',
    color: '#f0c040',
    bg: 'rgba(240,192,64,.15)',
    desc: 'Loyal, process-oriented, risk-averse, slow to change.',
    talk: "Be patient. Walk them through the process. Reassure them on timelines and quality. Don't push.",
    close: "Show them you've done this before. Reference similar clients. Make it feel safe and proven.",
    avoid: 'High-pressure tactics. Moving too fast. Uncertainty about process or timeline.',
  },
  C: {
    label: 'Conscientious',
    color: '#9b7fe8',
    bg: 'rgba(155,127,232,.15)',
    desc: 'Detail-oriented, analytical, skeptical, needs proof.',
    talk: 'Come prepared. Know your product inside out. Answer every question thoroughly. Send follow-up docs.',
    close: "Give them time to review. Don't rush the decision. Accuracy matters more than speed to them.",
    avoid: 'Vague claims. Overselling. Rushing. Anything that feels like spin.',
  },
};
