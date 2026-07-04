/** CI / regression 测试用 dummy env，避免 shared env 模块加载失败 */
process.env.ASTRA_DB_COLLECTION ??= "ci_dummy_collection";
process.env.ASTRA_DB_API_ENDPOINT ??= "https://ci-dummy.example.com";
process.env.ASTRA_DB_APPLICATION_TOKEN ??= "AstraCS:ci-dummy-token";
process.env.GOOGLE_GENERATIVE_AI_API_KEY ??= "ci-dummy-google-key";
process.env.GROQ_API_KEY ??= "ci-dummy-groq-key";
process.env.NIM_API_KEY ??= "ci-dummy-nim-key";
