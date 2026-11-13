// Reads the seeded task templates out of migration_dropflow.sql (used by the tests and the dev-only demo data, so they cannot drift from the SQL).
export function parseTemplates(sql) {
  const start = sql.indexOf('INSERT INTO drop_task_templates');
  const block = sql.slice(start, sql.indexOf('ON CONFLICT (key) DO NOTHING;', start));
  const out = [];
  for (const line of block.split('\n')) {
    const m = line.match(/^\s*\('([a-z_]+)',\s*'(\w+)',\s*'((?:[^']|'')*)',\s*'(\w+)',\s*(-?\d+),\s*'\{([^}]*)\}',\s*'\{([^}]*)\}',\s*(NULL|'\w+'),\s*(NULL|'\w+'),\s*(\d+)(?:,\s*(NULL|'(?:[^']|'')*'))?/);
    if (!m) continue;
    out.push({ key: m[1], phase: m[2], title: m[3].replace(/''/g, "'"), owner_role: m[4], offset_days: +m[5], depends_on: m[6] ? m[6].split(',') : [], na_for: m[7] ? m[7].split(',') : [],
      only_if: m[8] === 'NULL' ? null : m[8].replace(/'/g, ''), blocker_group: m[9] === 'NULL' ? null : m[9].replace(/'/g, ''), sort: +m[10],
      description: !m[11] || m[11] === 'NULL' ? null : m[11].slice(1, -1).replace(/''/g, "'"), active: true });
  }
  return out;
}
