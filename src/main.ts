import { reportStartupFailure } from './lib/startup-failure'

void import('./bootstrap').catch(reportStartupFailure)
