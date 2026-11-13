use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;

fn spawn() -> (std::process::Child, std::process::ChildStdin, mpsc::Receiver<serde_json::Value>) {
    let mut child = Command::new(env!("CARGO_BIN_EXE_fswatch"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let stdin = child.stdin.take().unwrap();
    let stdout = child.stdout.take().unwrap();
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let _ = tx.send(serde_json::from_str(&line).unwrap());
        }
    });
    (child, stdin, rx)
}

fn next(rx: &mpsc::Receiver<serde_json::Value>) -> serde_json::Value {
    rx.recv_timeout(Duration::from_secs(5)).expect("no event within 5s")
}

#[test]
fn size_watch_and_errors() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("a"), [0u8; 7]).unwrap();
    let (mut child, mut stdin, rx) = spawn();

    assert_eq!(next(&rx)["event"], "ready");

    writeln!(stdin, r#"{{"op":"size","id":"s1","path":{:?}}}"#, dir.path()).unwrap();
    let event = next(&rx);
    assert_eq!((event["id"].as_str(), event["bytes"].as_u64(), event["files"].as_u64()), (Some("s1"), Some(7), Some(1)));

    // The watched folder doesn't exist yet: first report is 0, then it picks the folder up.
    let sub = dir.path().join("later");
    writeln!(stdin, r#"{{"op":"watch","id":"w1","paths":[{:?}],"intervalMs":100}}"#, sub).unwrap();
    assert_eq!(next(&rx)["bytes"], 0);
    std::fs::create_dir(&sub).unwrap();
    std::fs::write(sub.join("b"), [0u8; 11]).unwrap();
    let event = next(&rx);
    assert_eq!((event["id"].as_str(), event["bytes"].as_u64()), (Some("w1"), Some(11)));

    writeln!(stdin, r#"{{"op":"unwatch","id":"w1"}}"#).unwrap();
    writeln!(stdin, "garbage").unwrap();
    let event = next(&rx);
    assert_eq!(event["event"], "error");
    assert!(event.get("id").is_none());

    drop(stdin);
    assert!(child.wait().unwrap().success());
}
