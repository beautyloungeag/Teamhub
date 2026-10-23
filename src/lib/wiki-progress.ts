type Run = { article_id: string; kind: string }
type Quiz = { id: string; articleId?: string | null }
type Attempt = { quizId: string; employeeId: string; passed: boolean }

export function wikiProgress(rows: Run[], quizzes: Quiz[], attempts: Attempt[], employeeId: string) {
  const quizByArticle = new Map(quizzes.filter(q => q.articleId).map(q => [q.articleId!, q.id]))
  const passed = new Set(attempts.filter(a => a.employeeId === employeeId && a.passed).map(a => a.quizId))
  const read = new Set<string>(), runs = new Map<string, number>()
  for (const row of rows) {
    const quiz = quizByArticle.get(row.article_id)
    if ((!quiz || passed.has(quiz)) && (row.kind === 'gelesen' || row.kind === 'durchgang')) read.add(row.article_id)
    if (row.kind === 'durchgang') runs.set(row.article_id, (runs.get(row.article_id) ?? 0) + 1)
  }
  return { read, runs }
}
