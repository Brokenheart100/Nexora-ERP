import { runtimeStatus } from '../../utils/runtime/bff-runtime-info'

export default defineEventHandler(() => runtimeStatus())
