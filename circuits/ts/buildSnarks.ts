import * as argparse from 'argparse' 
import * as fs from 'fs'
import * as path from 'path'
import * as shell from 'shelljs'

import { config } from 'maci-config'
import { genSnarkVerifierSol } from './genVerifier'

const fileExists = (filepath: string): boolean => {
    const currentPath = path.join(__dirname, '..')
    const inputFilePath = path.join(currentPath, filepath)
    const inputFileExists = fs.existsSync(inputFilePath)

    return inputFileExists
}

const zkutilPath = config.zkutil_bin

const main = () => {
    const parser = new argparse.ArgumentParser({ 
        description: 'Compile a circom circuit and generate its proving key, verification key, and Solidity verifier'
    })

    parser.addArgument(
        ['-i', '--input'],
        {
            help: 'The filepath of the circom file',
            required: true
        }
    )

    parser.addArgument(
        ['-j', '--r1cs-out'],
        {
            help: 'The filepath to save the compiled circom file',
            required: true
        }
    )

    parser.addArgument(
        ['-w', '--wasm-out'],
        {
            help: 'The filepath to save the WASM file',
            required: true
        }
    )

    parser.addArgument(
        ['-v', '--vk-out'],
        {
            help: 'The filepath to save the verification key',
            required: true
        }
    )

    parser.addArgument(
        ['-p', '--pk-out'],
        {
            help: 'The filepath to save the proving key (as a .json file)',
            required: true
        }
    )

    parser.addArgument(
        ['-s', '--sol-out'],
        {
            help: 'The filepath to save the Solidity verifier contract',
            required: true
        }
    )

    parser.addArgument(
        ['-r', '--override'],
        {
            help: 'Override an existing compiled circuit, proving key, and verifying key if set to true; otherwise (and by default), skip generation if a file already exists',
            action: 'storeTrue',
            required: false,
            argumentDefault: false,
        }
    )

    parser.addArgument(
        ['-vs', '--verifier-name'],
        {
            help: 'The desired name of the verifier contract',
            required: true
        }
    )

    parser.addArgument(
        ['-pr', '--params-out'],
        {
            help: 'The filepath to save the params file',
            required: true
        }
    )

    const args = parser.parseArgs()
    const vkOut = args.vk_out
    const solOut = args.sol_out
    const inputFile = args.input
    const override = args.override
    const circuitOut = args.r1cs_out
    const wasmOut = args.wasm_out
    const verifierName = args.verifier_name
    const paramsOut = args.params_out
    const pkOut = args.pk_out

    // Check if the input circom file exists
    const inputFileExists = fileExists(inputFile)

    // Exit if it does not
    if (!inputFileExists) {
        console.error('File does not exist:', inputFile)
        return 1
    }

    // Set memory options for node
    shell.env['NODE_OPTIONS'] = '--max-old-space-size=4096'
    shell.config.fatal = true

    // Check if the circuitOut file exists and if we should not override files
    const circuitOutFileExists = fileExists(circuitOut)

    if (!override && circuitOutFileExists) {
        console.log(circuitOut, 'exists. Skipping compilation.')
    } else {
        console.log(`Compiling ${inputFile}...`)
        // Compile the .circom file
        shell.exec(`node --max-old-space-size=8192 ./node_modules/circom/cli.js ${inputFile} -r ${circuitOut} -w ${wasmOut}`)
        console.log('Generated', circuitOut, 'and', wasmOut)
    }

    const paramsFileExists = fileExists(paramsOut)
    if (!override && paramsFileExists) {
        console.log('params file exists. Skipping setup.')
    } else {
        console.log('Generating params file...')
        shell.exec(`${zkutilPath} setup -c ${circuitOut} -p ${paramsOut}`)
    }

    console.log('Exporting verification key...')
    shell.exec(`${zkutilPath} export-keys -c ${circuitOut} -p ${paramsOut} -r ${pkOut} -v ${vkOut}`)
    console.log(`Generated ${pkOut} and ${vkOut}`)

    console.log('Generating Solidity verifier...')

    const verifier = genSnarkVerifierSol(
        verifierName,
        JSON.parse(fs.readFileSync(vkOut).toString()),
    )

    fs.writeFileSync(solOut, verifier)
    return 0
}

if (require.main === module) {
    let exitCode;
    try {
        exitCode = main()
    } catch (err) {
        console.error(err)
        exitCode = 1
    }
    process.exit(exitCode)
}
