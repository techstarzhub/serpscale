(function($) {
    "use strict";
  
    const $documentOn = $(document);
    const $windowOn = $(window);
  
    $documentOn.ready( function() {
  
      /* ================================
       Mobile Menu Js Start
    ================================ */
    
    $('#mobile-menu').meanmenu({
        meanMenuContainer: '.mobile-menu',
        meanScreenWidth: "1199",
        meanExpand: ['<i class="far fa-plus"></i>'],
    });
    
     /* ================================
       Sidebar Toggle Js Start
    ================================ */

      $(".offcanvas__close,.offcanvas__overlay").on("click", function () {
        $(".offcanvas__info").removeClass("info-open");
        $(".offcanvas__overlay").removeClass("overlay-open");
      });
      $(".sidebar__toggle").on("click", function () {
        $(".offcanvas__info").addClass("info-open");
        $(".offcanvas__overlay").addClass("overlay-open");
      });
      
       /* ================================
       Body Overlay Js Start
    ================================ */

      $(".body-overlay").on("click", function () {
        $(".offcanvas__area").removeClass("offcanvas-opened");
        $(".df-search-area").removeClass("opened");
        $(".body-overlay").removeClass("opened");
      });
  
      /* ================================
       Sticky Header Js Start
    ================================ */

      $windowOn.on("scroll", function () {
        if ($(this).scrollTop() > 250) {
          $("#header-sticky").addClass("sticky");
        } else {
          $("#header-sticky").removeClass("sticky");
        }
      });      
      
       /* ================================
       Video & Image Popup Js Start
    ================================ */

      $(".img-popup").magnificPopup({
        type: "image",
        gallery: {
          enabled: true,
        },
      });

      $(".video-popup").magnificPopup({
        type: "iframe",
        callbacks: {},
      });
  
      /* ================================
       Counterup Js Start
    ================================ */

      $(".pp-count").counterUp({
        delay: 15,
        time: 4000,
      });
  
      /* ================================
       Wow Animation Js Start
    ================================ */

      new WOW().init();
  
      /* ================================
       Nice Select Js Start
    ================================ */

    if ($('.single-select').length) {
        $('.single-select').niceSelect();
    }

    


    /* ================================
       Pp-Brand Slider Js Start
    ================================ */
    if ($('.pp-brand-slider').length > 0) {
      const ppBrandSlider = new Swiper(".pp-brand-slider", {
        spaceBetween: 100,
        speed: 2000,
        loop: true,
        autoplay: {
          delay: 1000,
          disableOnInteraction: false,
        },
        breakpoints: {
          1199: {
            slidesPerView: 5,
          },
          991: {
            slidesPerView: 4,
          },
          767: {
            slidesPerView: 3,
          },
          575: {
            slidesPerView: 2,
          },
          0: {
            slidesPerView: 1,
          },
        },
      });
    }

    /* ================================
       Pp-Testimonial Slider Js Start
    ================================ */
    if ($('.pp-testimonial-slider').length > 0) {
      const PpTestimonialSlider = new Swiper(".pp-testimonial-slider", {
        spaceBetween: 100,
        speed: 2000,
        loop: true,
        autoplay: {
          delay: 1000,
          disableOnInteraction: false,
        },
         navigation: {
          prevEl: '.array-next',
          nextEl: '.array-prev',
        },
        breakpoints: {
          1199: {
            slidesPerView: 2,
          },
          991: {
            slidesPerView: 2,
          },
          767: {
            slidesPerView: 1,
          },
          575: {
            slidesPerView: 1,
          },
          0: {
            slidesPerView: 1,
          },
        },
      });
    }
  
    if ($('.pp-testimonial-slider-2').length > 0) {
      const PpTestimonialSlider2 = new Swiper(".pp-testimonial-slider-2", {
        spaceBetween: 100,
        speed: 2000,
        loop: true,
        autoplay: {
          delay: 1000,
          disableOnInteraction: false,
        },
        breakpoints: {
          1199: {
            slidesPerView: 1,
          },
          991: {
            slidesPerView: 1,
          },
          767: {
            slidesPerView: 1,
          },
          575: {
            slidesPerView: 1,
          },
          0: {
            slidesPerView: 1,
          },
        },
      });
    }

     //>> Instagram Slider Start <<//
        
      if($('.pp-instagram-banner-slider').length > 0) {
          const PpInstagramBannerSlider = new Swiper(".pp-instagram-banner-slider", {
              spaceBetween: 30,
              speed: 2000,
              loop: true,
              autoplay: {
                  delay: 2000,
                  disableOnInteraction: false,
              },
              breakpoints: {
                  1399: {
                      slidesPerView: 5,
                  },
                  1199: {
                      slidesPerView: 5,
                  },
                  991: {
                      slidesPerView: 4,
                  },
                  767: {
                      slidesPerView: 3,
                  },
                  650: {
                      slidesPerView: 2,
                  },
                  575: {
                      slidesPerView: 1,
                  },
                  0: {
                      slidesPerView: 1,
                  },
              },
          });
      }

       //>> Testimonial Slider Start <<//
        if($('.pp-testimonial-slider-3').length > 0) {
            const PpTestimonialSlider3 = new Swiper(".pp-testimonial-slider-3", {
                spaceBetween: 20,
                speed: 3000,
                loop: true,
                centeredSlides: true,
                autoplay: {
                    delay: 2000,
                    disableOnInteraction: false,
                },
                pagination: {
                    el: ".dot",
                    clickable: true,
                },
                navigation: {
                    nextEl: ".array-prev",
                    prevEl: ".array-next",
                },
                breakpoints: {
                    1199: {
                        slidesPerView: 3,
                    },
                    991: {
                        slidesPerView: 2,
                    },
                    767: {
                        slidesPerView: 2,
                    },
                    575: {
                        slidesPerView: 1,
                    },
                    0: {
                        slidesPerView: 1,
                    },
                },
            });
        }

   /* ================================
       Parallaxie Js Start
    ================================ */

        if ($('.parallaxie').length && $(window).width() > 991) {
            if ($(window).width() > 768) {
                $('.parallaxie').parallaxie({
                    speed: 0.55,
                    offset: 0,
                });
            }
        }
        

     /* ================================
       Mouse Cursor Animation Js Start
    ================================ */

    if ($(".mouseCursor").length > 0) {
        function itCursor() {
            var myCursor = jQuery(".mouseCursor");
            if (myCursor.length) {
                if ($("body")) {
                    const e = document.querySelector(".cursor-inner"),
                        t = document.querySelector(".cursor-outer");
                    let n,
                        i = 0,
                        o = !1;
                    (window.onmousemove = function(s) {
                        o ||
                            (t.style.transform =
                                "translate(" + s.clientX + "px, " + s.clientY + "px)"),
                            (e.style.transform =
                                "translate(" + s.clientX + "px, " + s.clientY + "px)"),
                            (n = s.clientY),
                            (i = s.clientX);
                    }),
                    $("body").on(
                            "mouseenter",
                            "button, a, .cursor-pointer",
                            function() {
                                e.classList.add("cursor-hover"),
                                    t.classList.add("cursor-hover");
                            }
                        ),
                        $("body").on(
                            "mouseleave",
                            "button, a, .cursor-pointer",
                            function() {
                                ($(this).is("a", "button") &&
                                    $(this).closest(".cursor-pointer").length) ||
                                (e.classList.remove("cursor-hover"),
                                    t.classList.remove("cursor-hover"));
                            }
                        ),
                        (e.style.visibility = "visible"),
                        (t.style.visibility = "visible");
                }
            }
        }
        itCursor();
      }
  
      /* ================================
       Search Popup Toggle Js Start
    ================================ */

    if ($(".search-toggler").length) {
        $(".search-toggler").on("click", function(e) {
            e.preventDefault();
            $(".search-popup").toggleClass("active");
            $("body").toggleClass("locked");
        });
    }



   /* ================================
       Back To Top Button Js Start
    ================================ */

    $windowOn.on('scroll', function() {
        if ($(this).scrollTop() > 20) {
            $("#pp-back-top").addClass("show");
        } else {
            $("#pp-back-top").removeClass("show");
        }
    });
    
    $documentOn.on('click', '#pp-back-top', function() {
        $('html, body').animate({ scrollTop: 0 }, 800);
        return false;
    });



    
    }); // End Document Ready Function


    function loader() {
        $(window).on('load', function() {
            // Animate loader off screen
            $(".preloader").addClass('loaded');                    
            $(".preloader").delay(600).fadeOut();                       
        });
    }

    loader();

  
  })(jQuery); // End jQuery