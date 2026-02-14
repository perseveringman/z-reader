/**
 * ASR Provider 模块入口
 *
 * 注册所有 Provider 并导出核心 API。
 */

export { registerProvider, getAllProviders, getProviderById, getActiveProvider, isAsrConfigured } from './asr-provider';
export type { AsrProvider, AsrJobCallbacks, AsrStreamCallbacks } from './asr-provider';

import { registerProvider } from './asr-provider';
import { VolcengineProvider } from './volcengine-provider';
import { TencentFlashProvider } from './tencent-provider';

// 注册所有内置 Provider
registerProvider(new VolcengineProvider());
registerProvider(new TencentFlashProvider());
