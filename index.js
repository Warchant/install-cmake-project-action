const core = require('@actions/core');
const exec = require('@actions/exec');
const tc = require('@actions/tool-cache');
const path = require('path');
const io = require('@actions/io');
const uuidV4 = require('uuid/v4');


const reportError = (e) => {
  core.warning(e);
  throw new Error(e);
}

const mustHaveBin = async (bin) => {
  try {
    return await io.which(bin, true);
  } catch(e) {
    reportError(`host must have '${bin}' installed`);
  }
}

const runCmake = async (argsAsString, src, dst, install) => {
  core.debug(`running cmake`);
  core.debug(`args=${argsAsString}, src=${src}, dst=${dst}, install=${install}`);

  const argsAsArray = argsAsString
    .split("-D")
    .filter(arg => arg.length > 0)
    .map(arg => `-D${arg}`);

  argsAsArray.push(`-H${src}`);  // source dir
  argsAsArray.push(`-B${dst}`);  // build dir
  argsAsArray.push(`-DCMAKE_INSTALL_PREFIX=${install}`); // install dir

  await exec.exec("cmake", argsAsArray);
}

const runMake = async (dst) => {
  core.debug(`running make`);
  await exec.exec("make", ["-C", dst, "install"]);
}

const getRootDir = async (dir) => {
  let output = '';

  await exec.exec("ls", [dir], {
    listeners: {
      stdout: (data) => {
        output += data.toString();
      }
    }
  });

  // https://github.com/Warchant/blake2s/archive/1.0.0.tar.gz
  // archive name = 1.0.0.tar.gz, after unpack = dir 1.0.0
  // return <dir>/1.0.0
  return path.join(dir, output.trim());
}

const downloadAndUnpack = async (url) => {
  const toolPath = await tc.downloadTool(url);
  if(url.endsWith(".tar.gz")) {
    return tc.extractTar(toolPath);
  } else if (url.endsWith(".zip")) {
    return tc.extractZip(toolPath);
  } else if (url.endsWith(".7z")) {
    return tc.extract7z(toolPath);
  } else {
    reportError(`unknown archive type: ${url}`)
  }
}

const build = async (url, cmakeArgs) => {
  core.debug('Building the project...');
  core.debug(`url=${url}, args=${cmakeArgs}`);

  const toolExtractedPath = await downloadAndUnpack(url);
  const sourceDir = await getRootDir(toolExtractedPath);
  const buildDir = `${toolExtractedPath}/${uuidV4()}`;
  const installDir = `${toolExtractedPath}/${uuidV4()}`;

  core.debug(`cmake arguments: ${cmakeArgs}`)
  await runCmake(cmakeArgs, sourceDir, buildDir, installDir);
  await runMake(buildDir);

  return installDir;
}

const run = async () => {
  try {
    const url = core.getInput('url', { required: true });
    const args = core.getInput('cmake_args', { required: true });

    const cmakePath = await mustHaveBin("cmake");
    const makePath = await mustHaveBin("make");
    const installDir = await build(url, args);

    core.setOutput('install_dir', installDir);
  } catch(e) {
    core.setFailed(e);
  }
}

run();
