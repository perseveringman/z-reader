import type { GraphNodeExecutor } from '../../core-agent';

export type ZReaderResumeSpecialists = Record<string, GraphNodeExecutor>;

function createSpecialist(name: string): GraphNodeExecutor {
  return {
    execute: async (context) => {
      return {
        success: true,
        output: {
          resumed: true,
          mode: 'delegate',
          adapter: 'zreader',
          specialist: name,
          nodeId: context.node.id,
          taskId: context.taskId,
          sessionId: context.sessionId,
          dependencyCount: Object.keys(context.dependencyResults).length,
        },
      };
    },
  };
}

export function createZReaderResumeSpecialists(): ZReaderResumeSpecialists {
  return {
    reader: createSpecialist('reader'),
    writer: createSpecialist('writer'),
    summarizer: createSpecialist('summarizer'),
  };
}
