import { logger } from 'flex-dev-utils';
import { FlexPluginError } from 'flex-dev-utils/dist/errors';

import * as deployScript from '../deploy';

jest.mock('../../clients/assets');
jest.mock('../../clients/services');
jest.mock('../../clients/configurations');
jest.mock('../../clients/environments');
jest.mock('../../clients/builds');
jest.mock('../../clients/deployments');
jest.mock('flex-dev-utils/dist/fs');
jest.mock('flex-dev-utils/dist/logger');
jest.mock('flex-dev-utils/dist/credentials', () => ({
  getCredential: jest.fn(),
}));
jest.mock('../../utils/runtime');
jest.mock('../../utils/paths', () => ({
  version: '1.0.0',
  assetBaseUrlTemplate: 'template',
}));

// tslint:disable
const Runtime = require('../../utils/runtime').default;
const AssetClient = require('../../clients/assets').default;
const BuildClient = require('../../clients/builds').default;
const DeploymentClient = require('../../clients/deployments').default;
const ConfigurationClient = require('../../clients/configurations').default;
const fs = require('flex-dev-utils/dist/fs');
// tslint:enable

describe('deploy', () => {
  const accountSid = 'AC00000000000000000000000000000000';
  const serviceSid = 'ZS00000000000000000000000000000000';
  const environmentSid = 'ZE00000000000000000000000000000000';
  const buildSid = 'ZB00000000000000000000000000000000';
  const deploymentSid = 'ZD00000000000000000000000000000000';
  const versionJSSid = 'ZV00000000000000000000000000000000';
  const versionMapSid = 'ZV00000000000000000000000000000001';

  (logger.colors as any).blue = jest.fn();
  const config = {account_sid: accountSid, serverless_service_sids: [serviceSid]};

  const upload = jest.fn()
    .mockImplementation((_: any, path: string) => {
      if (path.indexOf('map') === -1) {
        return Promise.resolve({sid: versionMapSid});
      } else {
        return Promise.resolve({sid: versionJSSid});
      }
    });
  const existingBuild = {sid: buildSid, asset_versions: [], function_versions: []};
  const createBuild = jest.fn().mockResolvedValue({sid: buildSid});
  const createDeployment = jest.fn().mockResolvedValue({sid: deploymentSid});
  const registerSid = jest.fn().mockResolvedValue(config);

  Runtime.mockImplementation(() => ({
    service: {sid: serviceSid},
    environment: {sid: environmentSid, build_sid: buildSid, domain_name: 'test.twil.io'},
    build: existingBuild,
  }));

  beforeEach(() => {
    jest.clearAllMocks();

    AssetClient.mockImplementation(() => ({ upload }));
    BuildClient.mockImplementation(() => ({ create: createBuild }));
    DeploymentClient.mockImplementation(() => ({ create: createDeployment }));
    ConfigurationClient.mockImplementation(() => ({ registerSid }));
  });

  describe('default', () => {
    const doDeploy = jest.spyOn(deployScript, '_doDeploy').mockResolvedValue(undefined);
    const readPackageJson = jest.spyOn(fs, 'readPackageJson').mockReturnValue({
      version: '1.0.0',
      name: 'plugin-test',
    });

    const expectDoDeployCalled = (version: string, options: object) => {
      expect(doDeploy).toHaveBeenCalledTimes(1);
      expect(doDeploy).toHaveBeenCalledWith(version, options);
    };

    afterAll(() => {
      doDeploy.mockRestore();
      readPackageJson.mockRestore();
    });

    it('should thrown an exception if no command is provided', async (done) => {
      try {
        await deployScript.default();
      } catch (e) {
        expect(e).toBeInstanceOf(FlexPluginError);
        expect(e.message).toContain('can only be');
        done();
      }

      expect(doDeploy).not.toHaveBeenCalled();
    });

    it('should throw an exception if incorrect command is provided', async (done) => {
      try {
        await deployScript.default('foo');
      } catch (e) {
        expect(e).toBeInstanceOf(FlexPluginError);
        expect(e.message).toContain('can only be');
        done();
      }

      expect(doDeploy).not.toHaveBeenCalled();
    });

    it('should throw an exception if custom is called without an argument', async (done) => {
      try {
        await deployScript.default('custom');
      } catch (e) {
        expect(e).toBeInstanceOf(FlexPluginError);
        expect(e.message).toContain('Custom version bump');
        done();
      }

      expect(doDeploy).not.toHaveBeenCalled();
    });

    it('should bump major', async () => {
      await deployScript.default('major');

      expectDoDeployCalled('2.0.0', {
        isPublic: false,
        overwrite: false,
        disallowVersioning: false,
      });
    });

    it('should bump minor', async () => {
      await deployScript.default('minor');

      expectDoDeployCalled('1.1.0', {
        isPublic: false,
        overwrite: false,
        disallowVersioning: false,
      });
    });

    it('should bump patch', async () => {
      await deployScript.default('patch');

      expectDoDeployCalled('1.0.1', {
        isPublic: false,
        overwrite: false,
        disallowVersioning: false,
      });
    });

    it('should bump custom', async () => {
      await deployScript.default('custom', 'custom-version');

      expectDoDeployCalled('custom-version', {
        isPublic: false,
        overwrite: false,
        disallowVersioning: false,
      });
    });

    it('should bump overwrite', async () => {
      await deployScript.default('overwrite');

      expectDoDeployCalled('1.0.0', {
        isPublic: false,
        overwrite: true,
        disallowVersioning: false,
      });
    });

    it('should run as public', async () => {
      await deployScript.default('major', '--public');

      expectDoDeployCalled('2.0.0', {
        isPublic: true,
        overwrite: false,
        disallowVersioning: false,
      });
    });

    it('should not allow version bumping', async () => {
      await deployScript.default('--disallow-versioning');

      expect(doDeploy).toHaveBeenCalledTimes(1);
      expect(doDeploy).toHaveBeenCalledWith('0.0.0', expect.any(Object));
    });
  });

  describe('_doDeploy', () => {
    it('should quite if build/ does not exist', async (done) => {
      const options = {
        isPublic: true,
        overwrite: false,
        disallowVersioning: false,
      };
      const checkFilesExist = jest.spyOn(fs, 'checkFilesExist').mockReturnValue(false);

      try {
        await deployScript._doDeploy('1.0.0', options);
      } catch (e) {
        expect(e).toBeInstanceOf(FlexPluginError);
        expect(e.message).toContain('Could not find');
        done();
      }

      checkFilesExist.mockRestore();
    });

    it('should quit if duplicate route is found', async (done) => {
      const options = {
        isPublic: true,
        overwrite: false,
        disallowVersioning: false,
      };
      const checkFilesExist = jest.spyOn(fs, 'checkFilesExist').mockReturnValue(true);
      const verifyPath = jest.spyOn(deployScript, '_verifyPath').mockReturnValue(false);

      try {
        await deployScript._doDeploy('1.0.0', options);
      } catch (e) {
        expect(e).toBeInstanceOf(FlexPluginError);
        expect(e.message).toContain('You already have a plugin');
        done();
      }

      checkFilesExist.mockRestore();
      verifyPath.mockRestore();
    });

    it('should not quit duplicate route is found but is overwrite', async () => {
      const options = {
        isPublic: true,
        overwrite: true,
        disallowVersioning: false,
      };
      const checkFilesExist = jest.spyOn(fs, 'checkFilesExist').mockReturnValue(true);
      const verifyPath = jest.spyOn(deployScript, '_verifyPath').mockReturnValue(false);

      await deployScript._doDeploy('1.0.0', options);

      checkFilesExist.mockRestore();
      verifyPath.mockRestore();
    });
  });

  describe('_verifyPath', () => {
    it('should return be false if asset bundle path exists', () => {
      const build = {
        asset_versions: [{path: '/baseUrl/bundle.js'}],
        function_versions: [],
      };

      expect(deployScript._verifyPath('/baseUrl', build as any)).toBeFalsy();
    });

    it('should return be false if asset bundle sourcemap path exists', () => {
      const build = {
        asset_versions: [{path: '/baseUrl/bundle.js.map'}],
        function_versions: [],
      };

      expect(deployScript._verifyPath('/baseUrl', build as any)).toBeFalsy();
    });

    it('should return be false if function bundle sourcemap path exists', () => {
      const build = {
        asset_versions: [],
        function_versions: [{path: '/baseUrl/bundle.js'}],
      };

      expect(deployScript._verifyPath('/baseUrl', build as any)).toBeFalsy();
    });

    it('should return be true', () => {
      const build = {
        asset_versions: [{path: '/baseUrl/anotherBundle.js'}],
        function_versions: [{path: '/baseUrl/yetAnotherBundle.js'}],
      };

      expect(deployScript._verifyPath('/baseUrl', build as any)).toBeTruthy();
    });
  });
});