import request from 'http-basic';
import HttpInterface, {HttpResponse} from './HttpInterface';

const createHttpHandler = (options: {
  [key: string]: any;
}): HttpInterface<Map<string, string>> => ({
  createHeaders: () => new Map(),
  get: async (url, headers) => {
    return await new Promise<HttpResponse>((resolve, reject) => {
      request(
        `GET`,
        url.href,
        {...options, headers: Object.fromEntries(headers.entries())},
        (err, res) => {
          if (err) reject(err);
          else
            resolve({
              statusCode: res!.statusCode,
              url: new URL(res!.url),
              body: res!.body,
            });
        },
      );
    });
  },
  post: async (url, headers, body) => {
    return await new Promise<HttpResponse>((resolve, reject) => {
      body.pipe(
        request(
          `POST`,
          url.href,
          {...options, headers: Object.fromEntries(headers.entries())},
          (err, res) => {
            if (err) reject(err);
            else
              resolve({
                statusCode: res!.statusCode,
                url: new URL(res!.url),
                body: res!.body,
              });
          },
        ) as NodeJS.WritableStream,
      );
    });
  },
});

export default createHttpHandler;
