#lang racket
;; Logic Variable Representation
(define (make-var id) (vector id))
(define (logic-var? x) (vector? x))
(define (same-var? v1 v2) (= (vector-ref v1 0) (vector-ref v2 0)))

(define (assp pred alist)
  (cond
    ((null? alist) #f)
    ((pred (caar alist)) (car alist))
    (else (assp pred (cdr alist)))))

;; Substitution Lookup (walk)
(define (resolve term subst)
  (let ((binding (and (logic-var? term)
                      (assp (lambda (v) (same-var? term v)) subst))))
    (if binding
        (resolve (cdr binding) subst)
        term)))

;; Extend substitution
(define (extend-subst var val subst)
  (cons (cons var val) subst))  ; simple cons instead of dotted pair

;; Unification
(define (unify u v subst)
  (let ((u (resolve u subst))
        (v (resolve v subst)))
    (cond
      ((and (logic-var? u) (logic-var? v) (same-var? u v)) subst)
      ((logic-var? u) (extend-subst u v subst))
      ((logic-var? v) (extend-subst v u subst))
      ((and (pair? u) (pair? v))
       (let ((subst (unify (car u) (car v) subst)))
         (and subst (unify (cdr u) (cdr v) subst))))
      (else (and (eqv? u v) subst)))))

;; Goal: unify two terms
(define (goal-equal u v)
  (lambda (state)
    (let ((new-subst (unify u v (car state))))
      (if new-subst
          (singleton-stream `(,new-subst . ,(cdr state)))
          empty-stream))))

;; Stream primitives
(define empty-stream '())

(define (singleton-stream state)
  (cons state empty-stream))

;; Fresh variable
(define (call-with-fresh f)
  (lambda (state)
    (let ((counter (cdr state)))
      ((f (make-var counter))
       `(,(car state) . ,(+ counter 1))))))

;; Logical OR
(define (disjunction g1 g2)
  (lambda (state)
    (stream-append (g1 state) (g2 state))))

;; Logical AND
(define (conjunction g1 g2)
  (lambda (state)
    (stream-bind (g1 state) g2)))

;; Stream append (with laziness)
(define (stream-append s1 s2)
  (cond
    ((null? s1) s2)
    ((procedure? s1) (lambda () (stream-append s2 (s1))))
    (else (cons (car s1)
                (stream-append (cdr s1) s2)))))

;; Stream bind (flatMap)
(define (stream-bind stream goal)
  (cond
    ((null? stream) empty-stream)
    ((procedure? stream) (lambda () (stream-bind (stream) goal)))
    (else
     (stream-append (goal (car stream))
                    (stream-bind (cdr stream) goal)))))