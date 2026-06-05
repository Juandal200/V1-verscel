var DashboardService = {
  getHomeData: function(user) {
    if (user.role === ROLES.ADMIN) {
      return this.getAdminHome_(user);
    }

    if (user.role === ROLES.INSTRUCTOR) {
      return this.getInstructorHome_(user);
    }

    return this.getStudentHome_(user);
  },

  getAdminHome_: function(user) {
    var users = dbReadAll_('Users');
    var attempts = dbReadAll_('Attempts');

    var activeUsers = users.filter(function(u) {
      return u.status === USER_STATUS.ACTIVE;
    }).length;

    var pendingUsers = users.filter(function(u) {
      return u.status === USER_STATUS.PENDING;
    }).length;

    return {
      view: 'ADMIN',
      metrics: {
        totalUsers: users.length,
        activeUsers: activeUsers,
        pendingUsers: pendingUsers,
        totalAttempts: attempts.length
      }
    };
  },

  getInstructorHome_: function(user) {
    var students = dbReadAll_('Users').filter(function(u) {
      return u.role === ROLES.STUDENT && u.assignedGroupId && u.status === USER_STATUS.ACTIVE;
    });

    return {
      view: 'INSTRUCTOR',
      metrics: {
        assignedStudents: students.length,
        activeGroups: 0,
        totalAttempts: 0,
        averageScore: 0
      }
    };
  },

  getStudentHome_: function(user) {
    var attempts = dbReadAll_('Attempts').filter(function(a) {
      return a.userId === user.userId;
    });

    var correctAttempts = attempts.filter(function(a) {
      return String(a.correct).toUpperCase() === 'TRUE';
    }).length;

    var successRate = attempts.length
      ? Math.round((correctAttempts / attempts.length) * 100)
      : 0;

    return {
      view: 'STUDENT',
      metrics: {
        currentLevel: Number(user.currentLevel || 1),
        currentCountry: user.currentCountry || 'USA',
        totalAttempts: attempts.length,
        successRate: successRate,
        totalLearningSeconds: Number(user.totalLearningSeconds || 0)
      }
    };
  }
};