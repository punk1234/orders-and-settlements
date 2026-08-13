import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const validConfig = {
    MONGO_URI: 'mongodb+srv://user:pass@cluster.mongodb.net/db',
    JWT_SECRET: 'a-sufficiently-long-random-secret',
  };

  it('passes through a valid config', () => {
    const result = validateEnv(validConfig);
    expect(result.MONGO_URI).toBe(validConfig.MONGO_URI);
    expect(result.JWT_SECRET).toBe(validConfig.JWT_SECRET);
  });

  it('throws a clear error when MONGO_URI is missing', () => {
    const { MONGO_URI, ...rest } = validConfig;
    void MONGO_URI;
    expect(() => validateEnv(rest)).toThrow(/MONGO_URI/);
  });

  it('throws a clear error when JWT_SECRET is too short', () => {
    expect(() => validateEnv({ ...validConfig, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('does not choke on unrelated env vars being present (e.g. PATH, HOME)', () => {
    expect(() =>
      validateEnv({ ...validConfig, PATH: '/usr/bin', HOME: '/home/user' }),
    ).not.toThrow();
  });
});
