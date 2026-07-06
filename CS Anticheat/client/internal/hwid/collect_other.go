//go:build !windows

package hwid

import "os"

// collect е stub за не-Windows платформи (скенерът е Windows-only;
// това позволява `go build` да минава за инструменти/тестове на Linux).
func collect() raw {
	host, _ := os.Hostname()
	return raw{ComputerName: host}
}
