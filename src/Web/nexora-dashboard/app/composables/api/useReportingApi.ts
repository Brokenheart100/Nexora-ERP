import { z } from 'zod'
import {
  financialReportSchema, reportDrillSchema, reportExportSchema, financeOverviewSchema, workspaceProjectionSchema,
  type AgingKind, type ReportKind, type ReportOptions, type ReportRange, type ReportRevision
} from '#shared/types/reporting'
import { agingSchema, partnerLedgerSchema } from '#shared/types/trade'
import { useDashboardApi } from './useDashboardApi'
import { financePath } from './useLedgerApi'

export const reportExportsPath = (workspace: string) => financePath(workspace) + '/report-exports'
const reportPath = (workspace: string, kind: ReportKind) => financePath(workspace) + '/reports/' + kind
export const reportPageSize = 20

export function useReportingApi() {
  const api = useDashboardApi()
  function pathWith(path: string, query: Record<string, string | boolean | number | undefined>) {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.set(key, String(value))
    }
    return params.size ? path + '?' + params : path
  }

  async function read<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal) {
    return schema.parse((await api.get(path, { signal })).data)
  }

  async function file(path: string, mediaType: string) {
    const response = await api.get<Blob>(path, { responseType: 'blob' })
    if (response.data.type.split(';')[0] !== mediaType) throw new Error('文件响应格式不正确。')
    return response.data
  }

  return {
    report: (workspace: string, kind: ReportKind, options: ReportOptions, signal?: AbortSignal, watermark?: ReportRevision) =>
      read(pathWith(reportPath(workspace, kind), { ...options, watermark }), financialReportSchema, signal),
    drill: (workspace: string, kind: ReportKind, row: string, options: ReportOptions, watermark: ReportRevision, page: number, signal?: AbortSignal) =>
      read(pathWith(reportPath(workspace, kind) + '/rows/' + encodeURIComponent(row), {
        from: options.from, through: options.through, watermark, basis: options.basis, page
      }), reportDrillSchema, signal),
    pdf: (workspace: string, kind: ReportKind, options: ReportOptions, watermark: ReportRevision) =>
      file(pathWith(reportPath(workspace, kind) + '/pdf', { ...options, watermark }), 'application/pdf'),
    exports: (workspace: string, signal?: AbortSignal) => read(reportExportsPath(workspace), z.array(reportExportSchema), signal),
    exportJob: (workspace: string, id: string, signal?: AbortSignal) =>
      read(reportExportsPath(workspace) + '/' + id, reportExportSchema, signal),
    exportFile: (workspace: string, id: string) => file(reportExportsPath(workspace) + '/' + id + '/file', 'text/csv'),
    overview: (workspace: string, range: ReportRange, signal?: AbortSignal) =>
      read(pathWith(financePath(workspace) + '/reporting/overview', { ...range }), financeOverviewSchema, signal),
    aging: (workspace: string, kind: AgingKind, through: string, page: number, watermark?: ReportRevision, signal?: AbortSignal) =>
      read(pathWith(financePath(workspace) + '/reporting/aging/' + kind, { through, page, pageSize: reportPageSize, watermark }), agingSchema, signal),
    partnerLedger: (workspace: string, kind: AgingKind, partner: string, range: ReportRange, watermark: ReportRevision, page: number, signal?: AbortSignal) =>
      read(pathWith(financePath(workspace) + '/reporting/partner-ledgers/' + kind + '/' + partner, {
        ...range, watermark, page, pageSize: reportPageSize
      }), partnerLedgerSchema, signal),
    projection: async (workspace: string, signal?: AbortSignal) => {
      const result = await api.get('/bff/api/reports/workspaces/' + workspace, { signal })
      if (result.status === 202) return { state: 'pending' as const, retryAfter: result.headers.get('retry-after') }
      return { state: 'ready' as const, projection: workspaceProjectionSchema.parse(result.data) }
    }
  }
}
