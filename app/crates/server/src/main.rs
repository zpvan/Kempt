use clap::{Parser, Subcommand};
use kempt_server::{serve, ServeOptions};
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "kempt-server")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    Serve {
        #[arg(long, default_value = "127.0.0.1")]
        host: String,
        #[arg(long, default_value_t = 3000)]
        port: u16,
        #[arg(long)]
        data_dir: Option<PathBuf>,
    },
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();
    let result = match cli.command {
        Command::Serve { host, port, data_dir } => serve(ServeOptions { host, port, data_dir }).await,
    };
    if let Err(error) = result {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
