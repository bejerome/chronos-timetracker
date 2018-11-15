// @flow
import {
  remote,
} from 'electron';
import querystring from 'querystring';
import config from 'config';
import client, {
  configureApi,
} from './client';
import {
  getHeaders,
} from './helper';


export function fetchProfile(): Promise<*> {
  return client.getMyself();
}

export function authJira({
  protocol,
  hostname,
  port,
  pathname,
  cookies,
}: {
  protocol: string,
  hostname: string,
  port: number | string,
  pathname: string,
  cookies: Array<any>,
}): Promise<*> {
  configureApi({
    protocol,
    hostname,
    port,
    pathname,
    cookies,
  });

  return client.getMyself({ debug: true });
}

export function checkUserPlan({ host }: {
  host: string,
}): Promise<*> {
  return fetch(`${config.apiUrl}/desktop-tracker/check-user-plan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      baseUrl: host,
    }),
  })
    .then(
      (res) => {
        const { status } = res;
        if (status === 200) {
          return res.json();
        }
        return { success: false };
      },
    )
    .then(
      (json: { success: boolean }) => json.success,
    );
}

export function chronosBackendAuth({
  host,
  username,
  password,
  port = '',
  protocol = 'https',
  pathPrefix = '/',
}: {
  host: string,
  username: string,
  password: string,
  port: string,
  protocol: string,
  pathPrefix: string,
}): Promise<*> {
  return fetch(`${config.apiUrl}/desktop-tracker/authenticate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'basic_auth',
      baseUrl: host,
      host,
      port,
      protocol,
      pathPrefix,
      basicToken: Buffer.from(`${username}:${password}`).toString('base64'),
    }),
  })
    .then((res) => {
      if (res.status > 400) {
        throw new Error('Cannot authorize to JIRA. Check your credentials and try again');
      }
      return res.json();
    });
}

export function chronosBackendOAuth({
  baseUrl,
  token,
  token_secret, // eslint-disable-line
}: {
  baseUrl: string,
  token: string,
  token_secret: string,
}): Promise<*> {
  return fetch(`${config.apiUrl}/desktop-tracker/authenticate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'OAuth',
      baseUrl,
      token,
      token_secret,
    }),
  }).then(res => res.json());
}

export async function chronosBackendGetJiraCredentials(): Promise<*> {
  const url: string = `${config.apiUrl}/desktop-tracker/authenticate`;
  return fetch(url, {
    headers: await getHeaders(),
  })
    .then((res) => {
      if (res.status > 400) {
        throw new Error('Automatic login failed, please enter your credentials again');
      }
      return res.json();
    });
}

export function getDataForOAuth(baseUrl: string): Promise<*> {
  const url: string = `${config.apiUrl}/desktop-tracker/getDataForOAuth?baseUrl=${baseUrl}`;
  return fetch(url, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  })
    .then(
      (res) => {
        if (res.status > 400) {
          return new Error(`Unknown error (/getDataForOAuth returned ${res.status})`);
        }
        return res.json();
      },
    );
}

export function getPermissions(
  opts: {
    issueId?: string | number,
    projectId?: string | number,
    issueKey?: string | number,
    projectKey?: string | number,
  },
): Promise<*> {
  return client.getMyPermissions(opts);
}

const handleNetError = (error: string): string => ({
  'Error: net::ERR_INTERNET_DISCONNECTED': 'Internet disconnected',
  'Error: net::ERR_PROXY_CONNECTION_FAILED': 'Proxy connection failed',
  'Error: net::ERR_CONNECTION_RESET': 'Connection reset',
  'Error: net::ERR_CONNECTION_CLOSE': 'Connection close',
  'Error: net::ERR_NAME_NOT_RESOLVED': 'Page unavailable',
  'Error: net::ERR_CONNECTION_TIMED_OUT': 'Nonnection timed out',
}[error] || 'Unknown Error');

export function getAuthCookies(
  payload: {
    pathname: string,
    protocol: string,
    username: string,
    password: string,
    baseUrl: string,
  },
): Promise<*> {
  const {
    pathname,
    protocol,
    username,
    password,
    baseUrl,
  } = payload;
  const url: string = `${baseUrl}/jira/rest/gadget/1.0/login`;
  const request = remote.net.request({
    url,
    method: 'POST',
  });
  const form = {
    os_username: username,
    os_password: password,
    os_cookie: true,
  };
  const postData = querystring.stringify(form);
  return new Promise((resolve, reject) => {
    request.on('response', (response) => {
      const cookie = response.headers['set-cookie'];
      if (response.headers['x-seraph-loginreason'].includes('OK')) {
        resolve(cookie.map((d) => {
          const name = d.split('=')[0];
          const value = d.split(`${name}=`)[1].split(';')[0];
          return ({
            path: pathname,
            name,
            value,
            httpOnly: protocol === 'http',
            expires: 'Fri, 31 Dec 9999 23:59:59 GMT',
          });
        }));
      }
      reject(new Error('Incorrect email address and / or password.'));
    });
    request.on('error', (error) => {
      reject(new Error(handleNetError(error)));
    });
    request.setHeader(
      'Content-Type',
      'application/x-www-form-urlencoded',
    );
    request.setHeader(
      'Content-Length',
      Buffer.byteLength(postData),
    );
    request.write(postData);
    request.end();
  });
}
