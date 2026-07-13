import type { InjectionKey } from 'vue'

import type { FrontendRingProvider } from './RingTextureProvider'

export const ringProviderKey: InjectionKey<FrontendRingProvider> = Symbol('FrontendRingProvider')
