/**
 * Sprint pieces the rail draws (design-system.md "Badges and tags", "Tasks
 * table", "Acceptance criteria list"): the status badge, the tasks table and
 * the criteria list.
 */
import type { AcceptanceCriterion, Task } from '../../core/model.js';
import { StatusIcon } from '../components/StatusIcon.js';
import { Inline } from './markdown.js';
import { taskIcon, taskStatusWords, type BadgeView } from './status.js';
import './sprint.css';

/** A derived status badge (`.status`), or the plain tag for "Not started" and friends. */
export function StatusBadge({ badge, testId }: { badge: BadgeView; testId?: string }) {
  if (badge.kind === 'tag') {
    return (
      <span className="tag" data-testid={testId} data-status="tag">
        {badge.text}
      </span>
    );
  }
  return (
    <span className={`status ${badge.kind}`} data-testid={testId} data-status={badge.kind}>
      <StatusIcon kind={badge.kind} />
      {badge.text}
    </span>
  );
}

/**
 * The tasks table: status (icon and word), `#`, task text. The Module and
 * Reference columns are never shown; a sparse row renders empty cells. A
 * blocked task gets the pink `needs` icon and word, a manual task the violet
 * `manual` icon and word (from `taskIcon`); only a blocked one gets a note
 * under its text, since a manual task's text already says what to do. A cut or deferred task is struck
 * through. Once any task is done or running, the not-started ones are
 * `remaining` and highlighted in amber, so a straggler doesn't fade into
 * the grey of a sprint nobody has touched.
 */
export function TasksTable({ tasks }: { tasks: readonly Task[] }) {
  if (tasks.length === 0) return <p className="none">No tasks</p>;
  const started = tasks.some((t) => t.status === 'done' || t.status === 'active');
  return (
    <table className="tasks" data-testid="tasks-table">
      <tbody>
        {tasks.map((task) => {
          const cut = task.status === 'cut' || task.status === 'deferred';
          const remaining = started && task.status === 'todo';
          const icon = taskIcon(task.status);
          return (
            <tr
              key={task.line}
              className={cut ? 'cut' : remaining ? 'remaining' : undefined}
              data-task={task.number ?? ''}
              data-status={task.status}
            >
              <td className={`st ${icon}`}>
                <span className="st-in">
                  <StatusIcon kind={icon} />
                  {taskStatusWords(task)}
                </span>
              </td>
              <td className="n">{task.number ?? ''}</td>
              <td className="t">
                <span className="text">
                  <Inline text={task.text} />
                </span>
                {task.status === 'blocked' && <span className="note">Blocked: waiting on you.</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Acceptance criteria as statements, each led by a square amber bullet. No checkboxes. */
export function CriteriaList({ criteria }: { criteria: readonly AcceptanceCriterion[] }) {
  if (criteria.length === 0) return <p className="none">None</p>;
  return (
    <ul className="criteria" data-testid="criteria">
      {criteria.map((c) => (
        <li key={c.line}>
          <span>
            <Inline text={c.text} />
          </span>
        </li>
      ))}
    </ul>
  );
}
