# Project Agent Instructions

- 没有明确要求时，使用中文进行对话。
- 开发服务器仅在实现或验证确有需要时启动。由智能体启动的开发服务器必须在使用完毕后主动停止，不得默认保留后台服务；只有用户明确要求保留时才可以继续运行。
- 原则上所有任务一律由单智能体完成。只有用户明确要求多智能体协作，或存在无法合理串行完成的特殊需求时，才可以使用子智能体。

## Context7

Use Context7 MCP to fetch current documentation whenever the user asks about a library, framework, SDK, API, CLI tool, or cloud service -- even well-known ones like React, Next.js, Prisma, Express, Tailwind, Django, or Spring Boot. This includes API syntax, configuration, version migration, library-specific debugging, setup instructions, and CLI tool usage. Use even when you think you know the answer -- your training data may not reflect recent changes. Prefer this over web search for library docs.

Do not use for: refactoring, writing scripts from scratch, debugging business logic, code review, or general programming concepts.

### Steps

1. Always start with `resolve-library-id` using the library name and the user's question, unless the user provides an exact library ID in `/org/project` format.
2. Pick the best match by exact name, description relevance, code snippet count, source reputation, and benchmark score. Use version-specific IDs when the user mentions a version.
3. Query the selected library documentation with the user's full question.
4. Answer using the fetched documentation.
