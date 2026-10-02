"""OR-Tools CP-SAT exact-cover optimizer. JSON in/out; no user text is persisted."""
import json
import sys
from ortools.sat.python import cp_model


def optimize(data):
    count = data['count']
    candidates = data['candidates']
    group_count = data['groupCount']
    previous = []
    results = []
    for mode_index, mode in enumerate(['cohesion', 'balance', 'coverage']):
        model = cp_model.CpModel()
        chosen = [model.new_bool_var(f'g{i}') for i in range(len(candidates))]
        for person in range(count):
            model.add_exactly_one(chosen[i] for i, c in enumerate(candidates) if person in c['members'])
        model.add(sum(chosen) == group_count)
        for old in previous:
            model.add(sum(chosen[i] for i in old) <= len(old) - 1)
        hint = next((cover for cover in data.get('hints', []) if not any(set(cover) == set(old) for old in previous)), None)
        if hint is not None:
            for i, variable in enumerate(chosen):
                model.add_hint(variable, int(i in hint))
        utilities = [round(c['utility'] * 10000) for c in candidates]
        total = sum(utilities[i] * chosen[i] for i in range(len(candidates)))
        if mode == 'balance':
            minimum = model.new_int_var(0, 10000, 'minimum_quality')
            for i, utility in enumerate(utilities):
                model.add(minimum <= utility).only_enforce_if(chosen[i])
            model.maximize(4 * minimum * group_count + total)
        elif mode == 'coverage':
            model.maximize(sum(round((.65 * c['pairCoverage'] + .35 * c['utility']) * 10000) * chosen[i] for i, c in enumerate(candidates)))
        else:
            model.maximize(total)
        solver = cp_model.CpSolver()
        solver.parameters.num_search_workers = 1
        solver.parameters.random_seed = 0
        solver.parameters.max_time_in_seconds = 3.0
        solver.parameters.max_deterministic_time = 1.0
        solver.parameters.cp_model_presolve = False
        status = solver.solve(model)
        fallback = False
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE) and hint is not None:
            # A time limit must not discard a known feasible cover. Validate that cover
            # with CP-SAT, retaining the exact-once and prior-result exclusion constraints.
            model.clear_objective()
            for i, variable in enumerate(chosen):
                model.add(variable == int(i in hint))
            solver.parameters.max_time_in_seconds = 1.0
            solver.parameters.max_deterministic_time = 1.0
            status = solver.solve(model)
            fallback = True
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            continue
        indexes = [i for i, variable in enumerate(chosen) if solver.value(variable)]
        previous.append(indexes)
        results.append({'mode': mode, 'indexes': indexes, 'solverStatus': 'FEASIBLE' if fallback else solver.status_name(status)})
    return results


if __name__ == '__main__':
    try:
        print(json.dumps(optimize(json.load(sys.stdin))))
    except (ValueError, KeyError, TypeError) as error:
        print(json.dumps({'error': str(error)}))
        sys.exit(1)
