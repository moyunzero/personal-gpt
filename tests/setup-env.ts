/** CI / regression 测试用 dummy env，避免 shared env 模块加载失败 */
process.env.ASTRA_DB_COLLECTION ??= "ci_dummy_collection";
process.env.ASTRA_DB_API_ENDPOINT ??= "https://ci-dummy.example.com";
process.env.ASTRA_DB_APPLICATION_TOKEN ??= "AstraCS:ci-dummy-token";
process.env.OPENROUTER_API_KEY ??= "sk-or-ci-dummy";
