import { runtimeStatus } from '../../utils/bff-runtime-info'

export default defineEventHandler(() => runtimeStatus())
