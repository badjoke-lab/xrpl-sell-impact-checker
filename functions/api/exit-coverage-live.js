import handlerModule from './exit_coverage_live_handler.cjs';

const handler = handlerModule.default || handlerModule;

export const onRequestGet = handler.onRequestGet;
