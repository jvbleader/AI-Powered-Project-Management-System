const rejectedPaths = new Set(["0"]);
const tasksData = [{title: "Task 0"}, {title: "Task 1"}];

const filterTasks = (tasks, currentPath) => {
  return tasks.map((t, i) => {
    const path = [...currentPath, i];
    const pathStr = path.join("-");
    
    const isRejected = path.some((_, idx) => rejectedPaths.has(path.slice(0, idx + 1).join("-")));
    if (isRejected) return null;
    
    const newTask = { ...t };
    if (newTask.subtasks && newTask.subtasks.length > 0) {
      newTask.subtasks = filterTasks(newTask.subtasks, path);
      if (newTask.subtasks.length === 0) {
        delete newTask.subtasks;
      }
    }
    return newTask;
  }).filter(Boolean);
};

console.log(filterTasks(tasksData, []));
