package commands

import (
	"regexp"
	"strconv"
	"strings"
)

// Reading is what one output line says about progress (nil fields: unknown).
type Reading struct {
	Percent *float64
	Bytes   *int64
	Items   *int64
	// Detail is what the tool says beside the percentage ("0:04:11 / 0:09:56 playing"), from a
	// (?P<detail>…) group of the entry's pattern.
	Detail *string
}

// Parser reads progress from output lines, one at a time.
type Parser interface {
	Read(line string) Reading
}

// NewParser returns the entry's parser.
func NewParser(entry Entry) Parser {
	switch entry.ProgressParser {
	case ParserRsyncProgress2:
		return rsyncParser{}
	case ParserPercentRegex:
		return regexParser{pattern: entry.progress}
	case ParserLineCount:
		return &lineCounter{}
	default:
		return noParser{}
	}
}

type noParser struct{}

func (noParser) Read(string) Reading { return Reading{} }

// rsync --info=progress2 prints "    1,234,567  45%   12.34MB/s    0:00:12 (xfr#3, to-chk=7/10)".
var rsyncLine = regexp.MustCompile(`^\s*([\d,]+)\s+(\d{1,3})%\s`)

type rsyncParser struct{}

func (rsyncParser) Read(line string) Reading {
	match := rsyncLine.FindStringSubmatch(line)
	if match == nil {
		return Reading{}
	}
	bytes, err := strconv.ParseInt(strings.ReplaceAll(match[1], ",", ""), 10, 64)
	if err != nil {
		return Reading{}
	}
	percent, _ := strconv.ParseFloat(match[2], 64)
	return Reading{Percent: &percent, Bytes: &bytes}
}

// maxDetail bounds what a tool's detail adds to its job (it is stored with the progress).
const maxDetail = 200

type regexParser struct{ pattern *regexp.Regexp }

func (p regexParser) Read(line string) Reading {
	match := p.pattern.FindStringSubmatch(line)
	if match == nil {
		return Reading{}
	}
	percent, err := strconv.ParseFloat(match[p.pattern.SubexpIndex("percent")], 64)
	if err != nil || percent < 0 || percent > 100 {
		return Reading{}
	}
	reading := Reading{Percent: &percent}
	if index := p.pattern.SubexpIndex("detail"); index >= 0 {
		detail := strings.TrimSpace(match[index])
		if len(detail) > maxDetail {
			detail = detail[:maxDetail]
		}
		reading.Detail = &detail
	}
	return reading
}

// lineCounter counts output lines as items (tools that print one line per file).
type lineCounter struct{ count int64 }

func (c *lineCounter) Read(line string) Reading {
	if strings.TrimSpace(line) == "" {
		return Reading{}
	}
	c.count++
	items := c.count
	return Reading{Items: &items}
}
