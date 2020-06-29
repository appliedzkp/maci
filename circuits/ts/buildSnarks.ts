import * as argparse from 'argparse' 
import * as fs from 'fs'
import * as path from 'path'
import * as shell from 'shelljs'

import { config } from 'maci-config'

const fileExists = (filepath: string): boolean => {
    const currentPath = path.join(__dirname, '..')
    const inputFilePath = path.join(currentPath, filepath)
    const inputFileExists = fs.existsSync(inputFilePath)

    return inputFileExists
}

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
        ['-j', '--json-out'],
        {
            help: 'The filepath to save the compiled circom file',
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
            help: 'The filepath to save the proving key (as a .bin file)',
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
        ['-m', '--params-out'],
        {
            help: 'The filepath to save the Bellman params file',
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
        ['-z', '--zkutil'],
        {
            help: 'The path to the zkutil binary',
            required: false,
            defaultValue: config.zkutil_bin
        }
    )


    const args = parser.parseArgs()
    const pkOut = args.pk_out
    const vkOut = args.vk_out
    const paramsOut = args.params_out
    const solOut = args.sol_out
    const inputFile = args.input
    const override = args.override
    const circuitJsonOut = args.json_out
    const verifierName = args.verifier_name
    const zkutilPath = args.zkutil

    // Check if zkutil exists
    const output = shell.exec(zkutilPath + ' -V')
    if (output.stderr) {
        console.error('zkutil not found. Please refer to the README for installation instructions.')
        return 1
    }


    // Check if the input circom file exists
    const inputFileExists = fileExists(inputFile)

    // Exit if it does not
    if (!inputFileExists) {
        console.error('File does not exist:', inputFile)
        return 1
    }

    // Set memory options for node
    shell.env['NODE_OPTIONS'] = '--max-old-space-size=4096'

    // Check if the circuitJsonOut file exists and if we should not override files
    const circuitJsonOutFileExists = fileExists(circuitJsonOut)

    if (!override && circuitJsonOutFileExists) {
        console.log(circuitJsonOut, 'exists. Skipping compilation.')
    } else {
        console.log(`Compiling ${inputFile}...`)
        // Compile the .circom file
        shell.exec(`circom ${inputFile} -o ${circuitJsonOut}`)
        console.log('Generated', circuitJsonOut)
    }

    const paramsFileExists = fileExists(paramsOut)
    const pkOutFileExists = fileExists(pkOut)
    const vkOutFileExists = fileExists(vkOut)

    if (!override && pkOutFileExists && vkOutFileExists && paramsFileExists) {
        console.log('Params file exists. Skipping setup.')
    } else {

        console.log('Generating params file...')
        shell.exec(`${zkutilPath} setup -c ${circuitJsonOut} -p ${paramsOut}`)

        console.log('Exporting proving and verification keys...')
        shell.exec(
            `${zkutilPath} export-keys -c ${circuitJsonOut} -p ${paramsOut}` +
            ` --pk ${pkOut} --vk ${vkOut}`
        )

        console.log(`Generated ${paramsOut}, ${pkOut} and ${vkOut}`)
    }

    console.log('Generating Solidity verifier...')
    const snarkjsPath = path.join(
        __dirname,
        '..',
        './node_modules/snarkjs/cli.js',
    )

    shell.exec(`${snarkjsPath} generateverifier --vk ${vkOut} -v ${solOut}`)

    // Replace the name of the verifier contract with the specified name as
    // we have two verifier contracts and we want to avoid conflicts
    const contractSource = fs.readFileSync(solOut).toString()
    const newSource = contractSource.replace(
        '\ncontract Verifier {', `\ncontract ${verifierName} {`,
    )

    fs.writeFileSync(solOut, newSource)
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
