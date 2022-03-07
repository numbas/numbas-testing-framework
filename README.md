*This is an abandoned path of development. The Numbas LTI tool now runs exams client-side when re-marking.*

# Numbas testing framework
This is a command-line script which runs [Numbas](https://www.numbas.org.uk/) exams for testing or remarking.

It's used by the Numbas LTI tool to verify exam packages, and to remark attempts when an exam is updated.

## Installation

1. Clone this git repository.
2. Install [node.js](https://nodejs.org/en/) or a compatible JavaScript runtime.
3. Install the dependencies with `npm install`.

## Use

```
./test_exam path_to_exam command
```

`path_to_exam` is a filesystem path to an extracted Numbas package.

`command` is one of:

* `test`: test that the exam package works correctly: it's loaded, an attempt is started and the expected answer is submitted for every part. Then the exam is loaded again, and the previous attempt is resumed and it checks that the score is the same.
* `remark`: pipe in a JSON-encoded dictionary of attempts: objects of the form `{"attempt_pk": integer, "cmi": SCORM data model}`.

The script always prints a JSON-encoded object with a boolean key `success` representing whether the command succeeded or not. The `remark` command also returns a key `results` describing changed SCORM data model elements for each attempt.
