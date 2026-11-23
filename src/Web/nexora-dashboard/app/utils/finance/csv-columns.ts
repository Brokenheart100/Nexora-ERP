export function csvColumns(line: string) {
  return Array.from(line.trimStart().matchAll(/(?:^|,)\s*(?:"((?:[^"]|"")*)"\s*(?=,|$)|([^,]*))/g),
    match => match[1] === undefined ? (match[2] ?? '').trim() : match[1].replaceAll('""', '"'))
}
