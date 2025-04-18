// bin/setup.js - Main setup script
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { program } = require('commander');
const inquirer = require('inquirer');
const chalk = require('chalk');
const TOML = require('@iarna/toml');

// Define CLI options
program
  .name('workflow-tracker-setup')
  .description('Setup Cloudflare Workflow Tracker in your project')
  .option('-d, --database <name>', 'D1 database name')
  .option('-w, --worker <name>', 'Worker name')
  .option('-i, --interactive', 'Run in interactive mode', true)
  .option('--skip-migrations', 'Skip running database migrations')
  .option('--skip-wrangler', 'Skip updating wrangler.toml')
  .parse(process.argv);

const options = program.opts();

async function run() {
  console.log(chalk.blue('Setting up Cloudflare Workflow Tracker...'));

  // Determine project root (where wrangler.toml is)
  const projectRoot = findProjectRoot(process.cwd());
  if (!projectRoot) {
    console.error(chalk.red('Error: Could not find wrangler.toml in current directory or parent directories.'));
    console.error(chalk.yellow('Please run this command from within a Cloudflare Workers project.'));
    process.exit(1);
  }

  console.log(chalk.green(`Found project root at: ${projectRoot}`));

  // Ask questions if in interactive mode
  let answers = {};
  if (options.interactive) {
    answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'database',
        message: 'What is the name of your D1 database for workflow tracking?',
        default: options.database || 'workflow_tracker',
        when: !options.database
      },
      {
        type: 'input',
        name: 'worker',
        message: 'What is the name of your worker?',
        default: options.worker || path.basename(projectRoot),
        when: !options.worker
      },
      {
        type: 'confirm',
        name: 'createDb',
        message: 'Create a new D1 database?',
        default: true
      },
      {
        type: 'confirm',
        name: 'runMigrations',
        message: 'Run database migrations?',
        default: true,
        when: !options.skipMigrations
      },
      {
        type: 'confirm',
        name: 'updateWrangler',
        message: 'Update wrangler.toml configuration?',
        default: true,
        when: !options.skipWrangler
      }
    ]);
  }

  // Combine CLI options and interactive answers
  const config = {
    database: options.database || answers.database || 'workflow_tracker',
    worker: options.worker || answers.worker || path.basename(projectRoot),
    createDb: answers.createDb || false,
    runMigrations: !options.skipMigrations && (answers.runMigrations !== false),
    updateWrangler: !options.skipWrangler && (answers.updateWrangler !== false)
  };

  // Create D1 database if needed
  let databaseId = '';
  if (config.createDb) {
    console.log(chalk.blue(`Creating D1 database: ${config.database}...`));
    try {
      const output = execSync(`npx wrangler d1 create ${config.database}`, { encoding: 'utf8' });
      console.log(chalk.green('Database created successfully!'));

      // Extract database ID from wrangler output
      const match = output.match(/id\s*=\s*"([^"]+)"/);
      if (match && match[1]) {
        databaseId = match[1];
        console.log(chalk.green(`Database ID: ${databaseId}`));
      } else {
        console.warn(chalk.yellow('Warning: Could not extract database ID from wrangler output.'));
        console.log('Please check your wrangler.toml file or dashboard for the database ID.');
      }
    } catch (error) {
      console.error(chalk.red('Error creating database:'), error.message);
      const useExisting = await inquirer.prompt([{
        type: 'confirm',
        name: 'continue',
        message: 'Would you like to continue with an existing database?',
        default: true
      }]);

      if (!useExisting.continue) {
        process.exit(1);
      }

      // Ask for database ID if creating failed
      const dbDetails = await inquirer.prompt([{
        type: 'input',
        name: 'databaseId',
        message: 'Please enter your existing D1 database ID:',
        validate: input => input.trim() !== '' || 'Database ID is required'
      }]);

      databaseId = dbDetails.databaseId;
    }
  } else if (config.runMigrations || config.updateWrangler) {
    // If not creating a new DB but we need the ID for other operations
    const dbDetails = await inquirer.prompt([{
      type: 'input',
      name: 'databaseId',
      message: 'Please enter your D1 database ID:',
      validate: input => input.trim() !== '' || 'Database ID is required'
    }]);

    databaseId = dbDetails.databaseId;
  }

  // Run migrations if requested
  if (config.runMigrations && databaseId) {
    await runMigrations(databaseId, config.database);
  }

  // Update wrangler.toml if requested
  if (config.updateWrangler) {
    await updateWranglerConfig(projectRoot, config, databaseId);
  }

  console.log(chalk.green.bold('Setup complete!'));
  console.log(chalk.blue('Next steps:'));
  console.log('1. Import the workflow tracker in your code:');
  console.log(chalk.gray('   import { createWorkflowService } from "@your-org/cloudflare-workflow-tracker";'));
  console.log('2. Create your workflow implementations using the tracker utilities');
  console.log('3. Deploy your worker with:');
  console.log(chalk.gray('   npx wrangler deploy'));
}

// Find the project root (where wrangler.toml is)
function findProjectRoot(startDir) {
  let currentDir = startDir;

  // Search up to 5 levels up
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(currentDir, 'wrangler.toml'))) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      // Reached root directory
      break;
    }

    currentDir = parentDir;
  }

  return null;
}

// Run database migrations
async function runMigrations(databaseId, databaseName) {
  console.log(chalk.blue('Running database migrations...'));

  // Get path to migration files
  const migrationsDir = path.join(__dirname, '..', 'templates', 'migrations');

  // Get all migration files sorted by name
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    console.log(chalk.blue(`Applying migration: ${file}`));
    const migrationSql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

    // Create a temporary SQL file
    const tempFile = path.join(process.cwd(), `temp_migration_${Date.now()}.sql`);
    fs.writeFileSync(tempFile, migrationSql);

    try {
      // Execute the migration
      execSync(`npx wrangler d1 execute ${databaseName} --file=${tempFile}`, {
        encoding: 'utf8',
        stdio: 'inherit'
      });
      console.log(chalk.green(`Migration ${file} applied successfully`));
    } catch (error) {
      console.error(chalk.red(`Error applying migration ${file}:`), error.message);
      throw error;
    } finally {
      // Clean up temp file
      fs.unlinkSync(tempFile);
    }
  }

  console.log(chalk.green('All migrations applied successfully!'));
}

// Update wrangler.toml configuration
async function updateWranglerConfig(projectRoot, config, databaseId) {
  console.log(chalk.blue('Updating wrangler.toml configuration...'));

  const wranglerPath = path.join(projectRoot, 'wrangler.toml');

  // Read existing wrangler.toml
  let wranglerConfig = {};
  try {
    const wranglerContent = fs.readFileSync(wranglerPath, 'utf8');
    wranglerConfig = TOML.parse(wranglerContent);
  } catch (error) {
    console.error(chalk.red('Error reading wrangler.toml:'), error.message);
    return;
  }

  // Check if the config already has our components
  let hasD1Binding = false;
  let hasDurableObject = false;

  // Check for existing D1 binding
  if (wranglerConfig.d1_databases) {
    hasD1Binding = wranglerConfig.d1_databases.some(db => db.binding === 'DB');
  } else {
    wranglerConfig.d1_databases = [];
  }

  // Check for existing Durable Object
  if (wranglerConfig.durable_objects) {
    if (wranglerConfig.durable_objects.bindings) {
      hasDurableObject = wranglerConfig.durable_objects.bindings.some(
        binding => binding.name === 'WORKFLOW_TRACKER'
      );
    }
  } else {
    wranglerConfig.durable_objects = { bindings: [] };
  }

  // Initialize migrations if not present
  if (!wranglerConfig.migrations) {
    wranglerConfig.migrations = [];
  }

  // Add D1 binding if not present
  if (!hasD1Binding && databaseId) {
    wranglerConfig.d1_databases.push({
      binding: 'DB',
      database_name: config.database,
      database_id: databaseId
    });
  }

  // Add Durable Object binding if not present
  if (!hasDurableObject) {
    // Ask if this is a service worker or client worker
    const isServiceWorker = await inquirer.prompt([{
      type: 'confirm',
      name: 'isService',
      message: 'Is this the main workflow service worker that exports WorkflowTracker? (If not, we\'ll configure it as a client)',
      default: true
    }]);
    
    if (isServiceWorker.isService) {
      // For the service worker, we don't need script_name
      wranglerConfig.durable_objects.bindings.push({
        name: 'WORKFLOW_TRACKER',
        class_name: 'WorkflowTracker'
      });
    } else {
      // For client workers, we need to specify script_name
      const scriptNamePrompt = await inquirer.prompt([{
        type: 'input',
        name: 'scriptName',
        message: 'Enter the name of your workflow service worker:',
        default: 'flowflare-service'
      }]);
      
      wranglerConfig.durable_objects.bindings.push({
        name: 'WORKFLOW_TRACKER',
        class_name: 'WorkflowTracker',
        script_name: scriptNamePrompt.scriptName
      });
    }

    // Add migration for Durable Object (only for service worker)
    if (isServiceWorker.isService) {
      const hasMigration = wranglerConfig.migrations.some(
        migration => migration.tag === 'workflow-tracker-v1'
      );

      if (!hasMigration) {
        wranglerConfig.migrations.push({
          tag: 'workflow-tracker-v1',
          new_classes: ['WorkflowTracker']
        });
      }
    }
  }

  // Add environment variables if not present
  if (!wranglerConfig.vars) {
    wranglerConfig.vars = {};
  }

  if (!wranglerConfig.vars.SERVICE_API_KEY) {
    // Generate a random API key
    const apiKey = crypto.randomBytes(16).toString('hex');
    wranglerConfig.vars.SERVICE_API_KEY = apiKey;
  }

  // Write updated wrangler.toml
  try {
    const updatedContent = TOML.stringify(wranglerConfig);
    fs.writeFileSync(wranglerPath, updatedContent);
    console.log(chalk.green('wrangler.toml updated successfully!'));

    // Show what was added
    console.log(chalk.blue('Added to wrangler.toml:'));
    if (!hasD1Binding) {
      console.log(chalk.gray('- D1 database binding'));
    }
    if (!hasDurableObject) {
      console.log(chalk.gray('- Durable Object binding and migration'));
    }
  } catch (error) {
    console.error(chalk.red('Error updating wrangler.toml:'), error.message);
  }
}

// Run the setup
run().catch(error => {
  console.error(chalk.red('Setup failed:'), error);
  process.exit(1);
});
