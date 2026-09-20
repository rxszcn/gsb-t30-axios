import { describe, it, expect } from 'vitest';
import axios from '../../../index.js';

describe('core::Axios', () => {
  describe('request error stack decoration', () => {
    async function expectAdapterFailurePreserved() {
      const failure = new Error('adapter failure');

      await expect(
        axios.request({
          url: 'http://localhost/test',
          adapter: () => Promise.reject(failure),
        })
      ).rejects.toBe(failure);
    }

    it('preserves the original error when Error.prepareStackTrace returns a non-string stack', async () => {
      const original = Error.prepareStackTrace;
      // Simulates instrumentation that overrides the V8 hook to return
      // structured call-site data instead of a formatted string.
      Error.prepareStackTrace = () => ({});

      try {
        await expectAdapterFailurePreserved();
      } finally {
        Error.prepareStackTrace = original;
      }
    });

    it('preserves the original error when Error.prepareStackTrace throws', async () => {
      const original = Error.prepareStackTrace;
      Error.prepareStackTrace = () => {
        throw new Error('stack formatting failure');
      };

      try {
        await expectAdapterFailurePreserved();
      } finally {
        Error.prepareStackTrace = original;
      }
    });

    it('preserves the original error when Error.captureStackTrace throws', async () => {
      const original = Error.captureStackTrace;
      Error.captureStackTrace = () => {
        throw new Error('stack capture failure');
      };

      try {
        await expectAdapterFailurePreserved();
      } finally {
        Error.captureStackTrace = original;
      }
    });
  });

  describe('params serialization failure envelope', () => {
    const url = 'http://127.0.0.1:1/q';

    const circularParams = () => {
      const params = { self: null };
      params.self = params;
      return params;
    };

    const expectParamsFailureEnvelope = async (promise) => {
      await expect(promise).rejects.toSatisfy((err) => {
        expect(axios.isAxiosError(err)).toBe(true);
        expect(err.code).toBe(axios.AxiosError.ERR_BAD_REQUEST);
        expect(err.config).toBeTruthy();
        return true;
      });
    };

    for (const adapter of ['http', 'fetch']) {
      it(`should reject circular params as an AxiosError with config [${adapter}]`, async () => {
        await expectParamsFailureEnvelope(axios.get(url, { adapter, params: circularParams() }));
      });

      it(`should reject a throwing paramsSerializer as an AxiosError with config [${adapter}]`, async () => {
        await expectParamsFailureEnvelope(
          axios.get(url, {
            adapter,
            params: { a: 1 },
            paramsSerializer: () => {
              throw new Error('serializer exploded');
            },
          })
        );
      });

      it(`should reject circular params from axios.request [${adapter}]`, async () => {
        await expectParamsFailureEnvelope(
          axios.request({ method: 'get', url, adapter, params: circularParams() })
        );
      });

      it(`should reject circular params from axios(url, config) [${adapter}]`, async () => {
        await expectParamsFailureEnvelope(axios(url, { adapter, params: circularParams() }));
      });
    }

    it('should expose the original config on the error', async () => {
      const params = circularParams();

      await expect(axios(url, { adapter: 'http', params })).rejects.toSatisfy(
        (err) => err.config && err.config.params === params
      );
    });
  });
});
